# @gql-x/plugin-defradb

A plugin for [`@gql-x/composer` (GraphQL query-string DSL)](https://github.com/gql-x/composer) extending DSL support for the GraphQL flavor of [DefraDB](https://source.network/defradb): Source Network's open-source, peer-to-peer document database with native GraphQL and CRDT-based sync.

This package produces GraphQL **text** in the shape DefraDB expects: filter payloads with rich comparator vocabularies, structured mutation inputs, aggregate functions at field-level and operation-root positions, grouped aggregates, `over(...)`-wrapped relation arguments, and the rest of DefraDB's GraphQL surface. Use it to author queries in source files for AOT compilation, generate static `.graphql` artifacts as a build step, build dev tooling, or compose dynamic queries at runtime for handoff to whatever execution layer you've got.

For executing queries directly against a live DefraDB instance over HTTP (with transaction support), there's a companion package: [`@gql-x/plugin-defradb-transport-http`](https://github.com/gql-x/plugin-defradb-transport-http). This package itself produces strings; what you do with them is up to you.

## Relationship to `@gql-x/composer`

`@gql-x/plugin-defradb` is built on [`@gql-x/composer`](https://github.com/gql-x/composer), the generic GraphQL query-string composer at the base of the `gql-x` family. The composer handles variable bookkeeping, dynamic composition, selection-set rendering, and the field/argument/root-level extension seams that this plugin uses to add DefraDB-specific vocabulary.

This plugin is a worked example of composer's extensibility architecture in action — it demonstrates how a layered plugin adds backend-specific syntax (filters, aggregates, `over`, etc.) on top of the bare composer without modifying composer itself. Plugin authors targeting other GraphQL-speaking backends should find this package's source useful as a reference; see composer's [EXTENSIBILITY.md](https://github.com/gql-x/composer/blob/main/EXTENSIBILITY.md) for the mechanism details.

## Design Overview

Two primary goals motivate the design (inherited from composer):

1. **Reduce variable bookkeeping.** Annotate a variable's type at its use site; the builder hoists the declaration into the operation's parameter list and deduplicates automatically.

2. **First-class dynamic composition.** Query fragments — filters, inputs, selection-sets, order clauses — are plain JS values that can be conditionally included, named, passed around, and combined using ordinary host-language logic. No string templating, no parameter-list maintenance.

A third theme runs throughout: meaning is conveyed by explicit names (`selectionSet`, `varFilters`, `litArgs`) rather than syntactic position. This trades raw-GraphQL positional convention for label-driven composition that can be reordered to foreground whatever matters most about a given query.

For a fuller discussion of design rationale, tradeoffs, and audiences, see composer's [DESIGN.md](https://github.com/gql-x/composer/blob/main/DESIGN.md).

## Type Name Prefixing

DefraDB doesn't currently support native collection namespacing, so this DSL approximates it through auto-prefixing of schema names. The prefix is applied to all non-built-in variable and input types, and to root field names.

For predictability, a prefixed root field name (e.g., `add_Dev_User`) is automatically aliased back to its non-prefixed form (`add_User`) in the result set.

For example, with `NAME_PREFIX: "Dev_"`, `User` automatically gets prefixed to `Dev_User` (i.e., `add_User: add_Dev_User`) to match what's actually in your schema. But the result set uses the alias (original) name (`add_User`).

The set of non-prefixed types extends the GraphQL spec built-ins with DefraDB's: `JSON`, `DateTime`, `Ordering`, `Commit`, `Blob`, `_commits`.

## Features

In addition to the core variable hoisting and dynamic composition described above, this DSL offers:

* Two kinds of fluent helpers: option-key helpers (`varFilters(..)`, `selectionSet(..)`, `over(..)`, `groupBy(..)`, etc.) and chunk-producing helpers (`$p(..)`, `$v(..)`, `$m(..)`, `$f`, `$t`, `$a`, and `GROUP(..)`); both produce the same plain JS object structures the query-builder accepts directly. These helpers reduce repetition and visual tax, but their object literal equivalents are always accepted as alternatives, or for mix-and-match.

* Literal-based arguments, including common literals like `42` and `"hello"`, as well as bare-tokens (e.g., keywords/enums like `DESC`, `UTC_NOW`)

* Field-level aliasing and arguments (including variable-based and literal-based)

* Short-hand helpers for common arguments (`input`, `filter`) in both literal-based and variable-based forms, at both operation and field level (if applicable)

* Manual variable declarations, as well as inserting a matching variable reference in any literal-based argument position as explicitly specified

* Aggregate function support (`COUNT`, `MAX`, `SUM`, `MIN`, `AVG`, etc.) at both selection-set field-level and operation-root positions, along with `groupBy` / `GROUP` for grouped aggregates

## At a Glance

Suppose you want to write a GraphQL query like the one below, fetching a user by ID, filtering by a search term against either the first or last name, created since some date, and including a count of their recent posts:

```graphql
query GetUser(
    $_docID: ID,
    $searchTerm: String,
    $sinceDate: DateTime
) {
    User: Dev_User(
        filter: {
            _docID: { _eq: $_docID },
            _or: [
                {
                    firstName: { _eq: $searchTerm }
                },
                {
                    lastName: { _eq: $searchTerm }
                }
            ],
            createdAt: { _gt: $sinceDate }
        }
    ) {
        _docID
        firstName
        lastName
        recentPostsTotal: COUNT(
            posts: {
                filter: {
                    publishedAt: { _gt: $sinceDate }
                }
            }
        )
    }
}
```

A few things stand out as friction:

* **Variable duplication.** `$searchTerm` is declared once but its definition (`$searchTerm: String`) lives far away from the two places it's actually referenced. Same for `$sinceDate`, which is referenced in two structurally different positions (top-level filter and inside the COUNT).
* **Manual prefixing.** `User` has to be hand-prefixed to `Dev_User` (and aliased back to `User` for a clean result name).
* **Nesting tax.** The filter and selection-set syntax is heavy on braces and repeated field names. Every comparator is a two-level `{ field: { _op: $var } }` shape.
* **Sigil bookkeeping.** Every variable carries a `$` everywhere it appears, and every operator carries a leading `_`. Easy to typo, easy to forget.

Here's the equivalent using the DSL:

```js
DQL.collection("User").get(
    varFilters(
        $p.eq("_docID","ID"),
        $p.or(
            $p.eq("firstName","searchTerm","String"),
            $p.eq("lastName","searchTerm","String")
        ),
        $p.gt("createdAt","sinceDate","DateTime")
    ),
    selectionSet(
        "_docID",
        "firstName",
        "lastName",
        $f`recentPostsTotal ${$a.COUNT(
            over("posts"),
            varFilters(
                $p.gt("publishedAt","sinceDate","DateTime")
            )

            // OR:
            // litFilters(
            //     $p.lit.gt("publishedAt",$t.$sinceDate)
            // )
        )}`
    )
)
```

**NOTE:** The `$f` helper above is shown in its JS-specific tagged-template form (`` $f`alias`...` ``). It also supports a traditional function-call form; see [`$f` Function-Call Form](#f-function-call-form) below.

Variables are declared inline at their use sites, then hoisted into the parameter list (and de-duplicated) by the builder, so you never have to type both a separate parameter declaration and the use-site reference. The `Dev_` prefix and `User` alias are automatic. Filter comparators collapse to single helper calls, and a literal-position variable reference (`$t.$sinceDate` inside the COUNT) ties back to the same `$sinceDate` declared up in `varFilters`.

The rest of this README walks through each helper (`$p`, `$v`, `$f`, `$t`, `$m`, `$a`) and the full set of query-builder options.

## Getting Started

```js
import { createDefraDBComposer } from "@gql-x/plugin-defradb";

var DQL = createDefraDBComposer({
    NAME_PREFIX: "Dev_",
});

var query = DQL.collection("User").get(
    varFilters($p.eq("_docID","ID")),
    selectionSet("firstName","lastName")
);

console.log(query.text);
// → "query GetUser($_docID:ID) { User: Dev_User(filter:{_docID:{_eq:$_docID}}) { firstName lastName } }"

console.log(query.operationName);
// → "GetUser"
```

The result of `DQL.collection(...).get(...)` (and `.add(...)`, `.update(...)`, `.delete(...)`, `.COUNT(...)`, etc.) is a query-result object with `text`, `operationName`, and `resultName` properties — see [Query Builder Result](#query-builder-result) below.

For dynamic-composition workflows, the helpers below are imported either from the same package or destructured off the DQL instance:

```js
import {
    $f, $t, $v, $m, $a, $p,
    varArgs, litArgs, varDefs,
    varFilters, litFilters,
    varInputs, litInputs,
    selectionSet, root, over,
    groupBy, GROUP,
} from "@gql-x/plugin-defradb";
```

For executing queries against a live DefraDB instance over HTTP, use [`@gql-x/plugin-defradb-transport-http`](https://github.com/gql-x/plugin-defradb-transport-http) instead — its entry point bundles this package's query-building surface with a transport that handles `exec()` and transactions.

## Fluent Helpers vs. Object Literal Forms

This DSL provides two families of helpers, and both produce plain JS object structures that the query-builder consumes:

1. **Option-key helpers** like `varFilters(..)`, `litArgs(..)`, `selectionSet(..)`, `over(..)`, `groupBy(..)`, etc. Each produces a single-property object keyed by its option name. They're passed as variadic arguments to `get(..)` / `add(..)` / `queryBuilder(..)` etc.

    In other words, `varFilters(..)` produces `{ varFilters: .. }`.

2. **Chunk-producing helpers** like `$p.<op>(..)`, `$v(..)`, `$m(..)`, ``$f`...` ``, `$a.<FN>(..)`, `GROUP(..)`. They produce structural object chunks for the inside of those options.

    In other words, `$m(..)` produces `{ field: value }`.

Both families are pure object-shape sugar. Every helper has an equivalent object literal form, and the query-builder accepts either form interchangeably. Mix and match freely.

```js
// helper form (recommended)
DQL.collection("User").get(
    varFilters(
        $p.eq("firstName","String")
    )
)

// object literal form (also accepted)
DQL.collection("User").get({
    varFilters: {
        firstName: { _eq: "String" }
    }
})

// mixed (also accepted)
DQL.collection("User").get(
    varFilters({ firstName: { _eq: "String" } }),
    { selectionSet: [ "_docID" ] }
)
```

The object literal forms are the base. The helpers exist as sugar on top, to reduce repetition and visual syn-tax. If a helper doesn't fit a particular shape cleanly, drop down to an object literal for that piece and keep using helpers elsewhere.

## DB Driver

In addition to the query-builder, a thin set of helpers provides an interface for consistently generating common DefraDB operation types.

For example, these helpers build these kinds of query strings:

* `get(..)`: `query GetUser(..) { User(..) { .. } }`

* `add(..)`: `mutation AddUser(..) { add_User(..) { .. } }`

* `update(..)`: `mutation UpdateUser(..) { update_User(..) { .. } }`

* `delete(..)`: `mutation DeleteUser(..) { delete_User(..) { .. } }`

* `COUNT(..)`: `query CountUser(..) { COUNT(..) }`

The DB driver module directly exports:

* `createDefraDB(..)`: initializes an instance of the DB driver (with provided configuration)

Also, the DB driver provides the following convenience re-exports from the composer:

* `$f(..)`: helper for field-level definitions (aliases, arguments). Accepts either a tagged-template call (`` $f`alias``field` ``) or a traditional function call (`$f("alias","field")`); see [`$f` Function-Call Form](#f-function-call-form) for details.

* `$t`: helper object for literal-based arguments (bare-tokens, explicit variable references)

* `$v`: helper for variable leaf-specs in `varArgs` / `varInputs` / `varDefs`

* `$m`: helper for nested-map literal chunks (and computed-property selection-set entries)

* The option-key helpers `varArgs(..)`, `litArgs(..)`, `varDefs(..)`, `selectionSet(..)`

In addition, the DB driver provides DefraDB-specific helpers and re-exports:

* `$p`: helper for composing filter chunks (variable-based and literal-based), including relation/scalar-list traversal via `$p.any` / `$p.all`

* `$a`: helper proxy for aggregate functions (`COUNT`, `SUM`, `MAX`, `MIN`, `AVG`, etc) in selection-sets

* The option-key helpers `varInputs(..)`, `varFilters(..)`, `litInputs(..)`, `litFilters(..)`, `root(..)`, `over(..)`, `groupBy(..)`, and the `GROUP(..)` selector

### `createDefraDB(opts)`

Initializes an instance of the DB driver.

Pass in an optional object with the following configurations to customize the instance:

* `NAME_PREFIX` (string, default: `""`): sets the namespace prefix (e.g., `"Dev_"`)

* `transport` (object, optional): a transport object whose methods are spread directly onto the returned DB instance. The plugin doesn't introspect the transport — whatever methods it provides become methods on the DB instance. Pass this when you have an execution layer you want the DB instance to expose; otherwise, the returned instance is purely a query-string builder.

The return value of `createDefraDB(..)` is a DB instance.

### DB Instance

The DB instance has the following methods, which generally operate in a "fluent" style, meaning you can chain them together (`DB.prefix("Dev_").collection("User")...`):

* `prefix(..)`: returns a sibling DB instance with a different prefix (the original is unchanged)

* `collection(..)`: specifies the collection to use for the operation (e.g., `"User"`), returns a per-collection API (see below)

If a `transport` was passed to `createDefraDB(..)`, its methods are also available on the DB instance. For example, when paired with `@gql-x/plugin-defradb-transport-http`, the DB instance additionally exposes `exec(..)`, `hasActiveTransaction()`, `startTransaction(..)`, `commitTransaction()`, and `discardTransaction()`. Refer to the transport package's documentation for the specific shape it provides.

### Per-Collection API

The DB instance `collection(..)` method returns a separate API object, with the following methods:

* `get(..)`: as illustrated earlier, builds a `query { XYZ .. }` get operation; see "Collection Query Builder Options" below

* `add(..)`: as illustrated earlier, builds a `mutation { add_XYZ .. }` add operation; see "Collection Query Builder Options" below

* `update(..)`: as illustrated earlier, builds a `mutation { update_XYZ .. }` update operation; see "Collection Query Builder Options" below

* `delete(..)`: as illustrated earlier, builds a `mutation { delete_XYZ .. }` delete operation; see "Collection Query Builder Options" below

* `<AggregateFn>(..)`: any GraphQL-name function (e.g., `COUNT`, `MAX`, `SUM`, etc) is also exposed directly on the per-collection API as a method, for collection-root aggregates; see "Collection-Root Aggregates" below

The core query producing methods accept variadic option-key helpers (and/or a single options object), and return a query-builder result object (see below).

Example:

```js
DQL.collection("User").get(
    varFilters( /* .. */ ),
    selectionSet( /* .. */ )
)
// { text: "..", .. }

// equivalent object literal form:
DQL.collection("User").get({
    varFilters: { /* .. */ },
    selectionSet: [ /* .. */ ]
})
// { text: "..", .. }
```

### Query Builder Result

The `get(..)`, `add(..)`, `update(..)`, `delete(..)`, and `<AggregateFn>(..)` methods all return a query-builder result object, which has the following properties:

* `text`: the ready-to-execute query text

* `operationName`: the operation name embedded in the query text (e.g., `GetUser`), to pass along to the DefraDB endpoint

* `resultName`: the result set name (e.g., `User`)

Additionally, this query-builder result object has been decorated with a `tap(..)` method (for continued fluent chained-method calling):

* `tap(fn)`: a function that will be invoked with the query builder result and then return the same context; often used to `console.log(query.text)` for debugging purposes

If a transport was passed to `createDefraDBComposer(..)`, the result object will also be decorated with an `exec(..)` method that automatically uses the current query context, and only expects an optional `args` object. Without a transport, the query result is purely a string-builder output that you can hand off to whatever execution layer you have.

Example:

```js
var query = DQL.collection("User").get( /* .. */ );
// { text: "..", operationName: "GetUser", .. }

DQL.collection("User")
    .get( /* query builder options */ )
    .tap(query => console.log(query.text))
```

### Collection Query Builder Options

The `get(..)`, `add(..)`, `update(..)`, `delete(..)`, and `<AggregateFn>(..)` methods all accept variadic option-key helper calls (and/or a single options object). The following query aspects can be specified, either via their corresponding option-key helper or as a property on an options object:

* `litFilters` (option): specifies a literal-valued filter; a `filter` argument whose values are literals (not variable references). Short-hand for the `filter` key inside `litArgs` (described below).

    For example:

    ```js
    litFilters(
        $p.lit.eq("firstName","John")
    )
    ```

    Produces: `filter: { firstName: { _eq: "John" } }`.

* `litInputs` (option): specifies a literal-valued input payload; an `input` argument whose values are literals. Short-hand for the `input` key inside `litArgs` (described below).

    For example:

    ```js
    litInputs(
        $m("title","Hello World"),
        $m("isPublished",true)
    )
    ```

    Produces: `input: { title: "Hello World", isPublished: true }`.

* `litArgs` (option): the broader form, used for top-level (and field-level) arguments with literal values that fall outside the filter/input shorthands above. Leaf values can be built-in types (`42`, `"hello"`, etc), bare-tokens (`$t.DESC`), or manual variable references (`$t.$orderBy`).

    For example:

    ```js
    litArgs(
        $m("order",
            $m("lastName",$t.DESC)
        ),
        $m("limit",50)
    )
    ```

    Produces: `order: { lastName: DESC }, limit: 50`.

* `varFilters` (option): specifies a variable-valued filter; a `filter` argument whose comparator values are variable type-defs that the builder hoists into the operation parameter list. Short-hand for the `filter` key inside `varArgs` (described below).

    For example:

    ```js
    varFilters(
        $p.eq("firstName","String")
    )
    ```

    Produces operation parameters: `$firstName: String`, and operation arguments: `filter: { firstName: { _eq: $firstName } }`.

    The above `$p.eq(..)` specifies only one name (and a type), so the field name and variable name are assumed the same (`firstName` + `$firstName`). Similarly, in `filter` payloads, a bare type string set to an operator defaults the variable name to the owning field name, as illustrated in the object-literal form:

    ```js
    varFilters: {
        firstName: {
            _eq: "String"
        }
    }
    ```

    Produces operation parameters: `$firstName: String`, and operation arguments: `filter: { firstName: { _eq: $firstName } }`.

* `varInputs` (option): specifies a variable-valued input payload; an `input` argument whose values are variable type-defs hoisted into the operation parameter list. Short-hand for the `input` key inside `varArgs` (described below).

    For example:

    ```js
    varInputs(
        $v("title","jobTitle","String"),
        $v("isPublished","Boolean")
    )
    ```

    Produces operation parameters: `$jobTitle: String, $isPublished: Boolean`, and operation arguments: `input: { title: $jobTitle, isPublished: $isPublished }`.

* `varArgs` (option): the broader variables form, used for top-level (and field-level) arguments whose values are variable type-defs that fall outside the filter/input shorthands above.

    For example:

    ```js
    varArgs(
        $v("docID","userDocID","ID"),
        $v("limit","Int")
    )
    ```

    Produces operation parameters: `$userDocID:ID, $limit:Int`, and operation arguments: `docID:$userDocID, limit:$limit`.

* `varDefs` (option): manual variable type-defs. Adds explicit parameter declarations to the operation without tying them to any specific argument position; useful when a variable is referenced manually via `$t.$varName` in literal-based arguments.

    For example:

    ```js
    varDefs($v("hello","String"))
    ```

    Adds `$hello: String` to the variable type definition parameters. The variable can then be referenced in literal-based arguments (operation-level or field-level) via `$t.$hello`.

* `selectionSet` (option): specifies the fields to include in the selection-set. Defaults to including just `"_docID"`.

    For example:

    ```js
    selectionSet(
        "firstName",
        "lastName",
        $f`ownerEmail``email`
    )
    ```

    Produces: `firstName lastName ownerEmail: email`.

    Each argument to `selectionSet(..)` is a selection entry: a bare string for a scalar field, an `$f` helper for an aliased or argument-bearing field reference, an `$a.<FN>(..)` aggregate token, or an object-keyed entry for sub-selections (see "Field-Level Selections" below). The `$f` helper supports aliases, field-level arguments, and computed-property selection-set entries via `$m`.

    To omit the selection-set block entirely (e.g., for aggregate-only root queries): `selectionSet(null)`, `selectionSet($f.noSelection)`, or `selectionSet.none()`.

* `groupBy` (option): specifies the field names to group results by, for use with grouped aggregates. Field names are rendered as bare tokens (not quoted strings) in the GraphQL output, matching DefraDB's expected syntax. See the "Grouping" subsection under "Aggregates" below.

    For example:

    ```js
    groupBy("Age","Country")
    ```

    Produces: `groupBy: [Age, Country]`.

* `GROUP` (aggregate sub-selector helper): produces a chunk for use as a combinator inside `$a.<FN>(..)`, specifying which field the aggregate operates on within each group; not a top-level option itself. See the "Grouping" subsection under "Aggregates" below for more information.

    For example:

    ```js
    $a.MAX(GROUP("Age"))
    ```

    Produces: `MAX(GROUP: { field: Age })`.

* `$p` (filter DSL helper): a composable helper for building filter (aka, predicate) chunks for `litFilters` / `varFilters` (and the `filter` keys inside `litArgs` / `varArgs`). Reduces the syntactic tax of nested filter payloads.

    `$p(chunk1, chunk2, ..)` composes/merges multiple filter chunks; it takes the place of an object literal on the right side of `varFilters:` / `litFilters:`, merging the individual chunks passed in.

    ```js
    varFilters: $p(
        $p.eq("firstName","String"),
        $p.eq("lastName","userLastName","String")
    )
    ```

    Produces operation parameters: `$firstName: String, $userLastName: String`, and operation arguments: `filter: { firstName: { _eq: $firstName }, lastName: { _eq: $userLastName } }`.

    **NOTE:** Since `$p(..)` composes object chunks, the chunks it accepts can also be object-spread directly into a regular object literal as a more flexible alternative, useful when mixing DSL chunks with plain object properties. For example:

    ```js
    $p(
        $p.eq("a","String"),
        $p.eq("b","String")
    )
    ```

    is equivalent to:

    ```js
    {
        ...$p.eq("a","String"),
        ...$p.eq("b","String")
    }
    ```

    Scoped composition: `$p("field", chunk1, chunk2, ..)` scopes merged child chunks under a field key:

    ```js
    varFilters: $p("user",
        $p.eq("_docID", "userDocID", "ID"),
        $p.eq("isEnabled", "Boolean")
    )
    ```

    Produces operation parameters: `$userDocID: ID, $isEnabled: Boolean`, and operation arguments: `filter: { user: { _docID: { _eq: $userDocID }, isEnabled: { _eq: $isEnabled } } }`.

    Combinators: `$p.and(..)`, `$p.or(..)`, and `$p.not(..)` produce `_and` / `_or` / `_not` chunks. These chunk forms are usable directly at the top level in place of the `$p(..)` composer, since they each return a complete filter payload on their own. `$p.and(..)` and `$p.or(..)` wrap their chunks in an array; `$p.not(..)` merges its chunks into a single object.

    ```js
    varFilters: $p.or(
        $p.eq("firstName","String"),
        $p.eq("lastName","String")
    )
    ```

    Produces operation parameters: `$firstName: String, $lastName: String`, and operation arguments: `filter: { _or: [ { firstName: { _eq: $firstName } }, { lastName: { _eq: $lastName } } ] }`.

    ```js
    varFilters: $p.not(
        $p.eq("isDeleted","Boolean"),
        $p.eq("isArchived","Boolean")
    )
    ```

    Produces operation parameters: `$isDeleted: Boolean, $isArchived: Boolean`, and operation arguments: `filter: { _not: { isDeleted: { _eq: $isDeleted }, isArchived: { _eq: $isArchived } } }`.

    The remaining helpers below all produce chunks that must be passed into `$p(..)` (or `$p("field", ..)`, or `$p.and(..)` / `$p.or(..)` / `$p.not(..)`) to be used as a filter payload.

    Variable-side operators: `$p.<op>(..)` produces a field-centered comparator chunk. Any property name is interpreted as the operator name, with `_` prepended if not already present (`$p.eq` → `_eq`, `$p._in` → `_in`).

    The 2-arg form `$p.<op>(field,type)` defaults the variable name to the field name:

    ```js
    $p.eq("firstName","String")
    // chunk: { firstName: { _eq: "String" } }
    // type def: $firstName: String, filter: { firstName: { _eq: $firstName } }
    ```

    **NOTE:** Anywhere a type string appears -- as long as it doesn't include non-identifier characters like [ or ! -- a `$t` bare-name token is also accepted. For example: `$t.String`, `$t.DateTime`, `$t.ID`. This can help visually distinguish the type from the surrounding field/variable name strings:

    ```js
    $p.eq("firstName","userFirstName",$t.String)
    $v("docID","userDocID",$t.ID)
    ```

    The 3-arg form `$p.<op>(field,varName,type)` sets the variable name explicitly:

    ```js
    $p.eq("firstName","userFirstName","String")
    // chunk: { firstName: { _eq: { userFirstName: "String" } } }
    // type def: $userFirstName: String, filter: { firstName: { _eq: $userFirstName } }
    ```

    Literal-side operators: `$p.lit.<op>(field,value)` produces a literal filter chunk (for use in `litFilters` / `litArgs.filter`).

    ```js
    $p.lit.eq("isEnabled", true)
    // chunk: { isEnabled: { _eq: true } }
    // filter: { isEnabled: { _eq: true } }
    ```

    Relation/list traversal: `$p.any(..)` and `$p.all(..)` produce `_any` / `_all` chunks, used for filtering across relation fields (multi-element references) or scalar list fields. They merge their chunks into a single object payload (not an array, unlike `$p.and` / `$p.or`).

    For relation fields (objects with sub-fields), pass field-centered comparator chunks directly:

    ```js
        varFilters: $p("emails",
            $p.any(
                $p.eq("email","String"),
                $p.gt("verified","DateTime")
            )
        )
    ```

    Produces operation parameters: `$email: String, $verified: DateTime`, and operation arguments: `filter: { emails: { _any: { email: { _eq: $email }, verified: { _gt: $verified } } } }`.

    For scalar list fields, the elements themselves are being matched (not sub-fields of objects). Use `$p.any.is(..)` and `$p.all.are(..)` to express "any/all elements **that are** X":

    ```js
        varFilters: $p("recoveryCodes",
            $p.all.are(
                $p.in("currentRecoveryCodes","[String]")
            )
        )
    ```

    Produces operation parameters: `$currentRecoveryCodes: [String]`, and operation arguments: `filter: { recoveryCodes: { _all: { _in: $currentRecoveryCodes } } }`.

    When nested under `$p.any.is(..)` / `$p.all.are(..)`, the type-only 1-arg form `$p.<op>(type)` is also accepted, defaulting the variable name to the outer field:

    ```js
        varFilters: $p("recoveryCodes",
            $p.all.are(
                $p.in("[String]")
            )
        )
    ```

    Produces operation parameters: `$recoveryCodes: [String]`, and operation arguments: `filter: { recoveryCodes: { _all: { _in: $recoveryCodes } } }`.

    **NOTE:** The key semantic distinction: `$p.any(..)` / `$p.all(..)` express "elements **where** [field] matches X" — the inner chunks reference sub-fields of relation objects. `$p.any.is(..)` / `$p.all.are(..)` express "elements **that are** X" — an identity check on scalar list elements themselves. The `.is(..)` / `.are(..)` forms invert field-centered chunks accordingly.

* `$v` (var-spec leaf helper): a composable helper for building variable leaf-specs for `varArgs`, `varInputs`, and `varDefs`. Reduces the ceremony of repeating leaf spec object shapes.

    `$v(chunk1, chunk2, ..)` composes/merges chunks; it takes the place of an object literal on the right side of `varArgs:` / `varInputs:` / `varDefs:`, merging the individual leaf chunks passed in.

    ```js
    varArgs: $v(
        $v("docID", "[ID!]"),
        $v("cid", "commitID", "String")
    )
    ```

    **NOTE:** Since `$v(..)` composes object chunks, the chunks it accepts can also be object-spread directly into a regular object literal as a more flexible alternative, useful when mixing DSL chunks with plain object properties.

    For example:

    ```js
    $v(
        $v("docID","ID"),
        $v("cid","String")
    )
    ```

    is equivalent to:

    ```js
    {
        ...$v("docID","ID"),
        ...$v("cid","String")
    }
    ```

    The 2-arg form `$v(name,type)` defaults the variable name to the field/arg name:

    ```js
    $v("docID","ID")
    // chunk: { docID: "ID" }
    // type def: $docID: ID, action arg: docID: $docID
    ```

    **NOTE:** Anywhere a type string appears -- as long as it doesn't include non-identifier characters like [ or ! -- a `$t` bare-name token is also accepted. For example: `$t.String`, `$t.DateTime`, `$t.ID`. This can help visually distinguish the type from the surrounding field/variable name strings:

    ```js
    $v("docID",$t.ID)
    ```

    The 3-arg form `$v(name,varName,type)` sets the variable name explicitly:

    ```js
    $v("docID","userDocID","ID")
    // chunk: { docID: { userDocID: "ID" } }
    // type def: $userDocID: ID, action arg: docID: $userDocID
    ```

* `$m` (map literal helper, including nested maps): a helper for building object structures, useful in places where the literal data shape would otherwise require object-literal syntax.

    The 2-arg form `$m(name,value)` produces a single-property object:

    ```js
    $m("order",$t.DESC)
    // chunk: { order: $t.DESC }
    // action arg: order: DESC

    $m("foo",42)
    // chunk: { foo: 42 }
    // action arg: foo: 42
    ```

    Nesting requires explicit `$m` calls per level:

    ```js
    $m("order",
        $m("title",$t.DESC)
    )
    // chunk: { order: { title: $t.DESC } }
    // action arg: order: { title: DESC }
    ```

    Multiple chunk-objects as trailing args merge as siblings under the named property:

    ```js
    $m("order",
        $m("title",$t.DESC),
        $m("year",$t.ASC)
    )
    // chunk: { order: { title: $t.DESC, year: $t.ASC } }
    // action args: order: { title: DESC, year: ASC },
    ```

    `$m` also accepts a `$f` token (or its symbol) as the property-name, mirroring the `[$f`...`]` computed-property syntax, for selection-set entries:

    ```js
    selectionSet(
        $m(
            $f`recentPosts``posts ${ /* .. */ }`,
            [ "title", "publishedAt" ]
        ),
        $m(
            $f`postsTotal``COUNT ${ /* .. */ }`,
            $f.noSelection
        )
    )
    ```

    is equivalent to:

    ```js
    selectionSet: {
        [ $f`recentPosts``posts ${ /* .. */ }` ]:
            [ "title", "publishedAt" ],

        [ $f`postsTotal``COUNT ${ /* .. */ }` ]:
            $f.noSelection
    }
    ```

### Field-Level Selections

To alias a field name in a selection-set (using the tagged-template form of `$f`; see [`$f` Function-Call Form](#f-function-call-form) for the equivalent function-call syntax):

```js
selectionSet(
    // ..
    $f`userFirstName``firstName`,
    // ..
)
```

Produces a field-level reference like `userFirstName: firstName`, which aliases the `firstName` field name to `userFirstName` in the result set.

To specify field-level arguments (e.g., `litArgs`, `litFilters`, `varArgs`, and `varFilters`), which all behave like the operation-level specifier counterparts:

```js
selectionSet(
    // ..
    // WARNING: scalar field args not currently valid in DefraDB
    $f`firstName ${
        varArgs(
            $m("whatever",
                $m("someVar","String")
            )
        )
    }`,
    // ..
)
```

Produces an operation-level type definition `$someVar: String` and a field-level reference `firstName(whatever: $someVar)`.

**WARNING:** DefraDB does *NOT* currently support field-level arguments on scalar fields (like the `firstName` string field, above). It's possible DefraDB might support them (e.g., `filter`) sometime in the future, so this an inert/placeholder feature for now; DefraDB will currently complain about its use!

Field-level arguments *are* currently allowed on object fields with sub-selection (see below), as well as the aggregate functions (see "Aggregates" below).

To use field-level arguments (and aliases, if desired) on an object field, with sub-selection, pair the `$f` helper with `$m` to produce a computed-property selection-set entry. The `$f` interpolation accepts an array of chunks (merged together), so the option-key helpers and other chunk producers compose naturally inside it:

```js
selectionSet(
    // ..
    $m(
        $f`myBooks``books ${[
            litArgs($m("order",$m("title",$t.DESC))),
            litFilters($p.lit.eq("isPublished", true))
        ]}`,
        [ "title", "author" ]
    )
    // ..
)
```

**NOTE:** The `[ ]` surrounding the interpolation expression is there to allow the two `litArgs(..)` and `litFilters(..)` values. If there's only one value being interpolated, you can pass it directly without the `[ ]` around it.

The `$f` interpolation also accepts a single object literal directly, equivalent to the array-of-chunks form above:

```js
selectionSet(
    // ..
    $m(
        $f`myBooks``books ${{
            litArgs: { order: { title: $t.DESC } },
            litFilters: { isPublished: { _eq: true } }
        }}`,
        [ "title", "author" ]
    )
)
```

Either form above produces this field-level reference with sub-selection:

```graphql
myBooks: books(
    order: { title: DESC },
    filter: {
        isPublished: { _eq: true }
    }
) {
    title
    author
}
```

### `$f` Function-Call Form

`$f` supports two equivalent calling styles. The tagged-template form is JS-specific and reads closer to GraphQL's own alias syntax. The function-call form is conventional JS and is the basis for ports to other languages (Go, Rust, etc.).

Both forms produce identical tokens and work interchangeably in all positions: `selectionSet(..)`, computed property keys (`{ [$f(...)]: subSel }`), and `$m(..)`.

**Signatures:**

```js
// tag form
$f`fieldName`
$f`alias``fieldName`
$f`fieldName ${combinator}`
$f`alias``fieldName ${combinator}`
$f`alias ${$a.FN(...)}`

// function-call form
$f("fieldName")
$f("alias", "fieldName")
$f("fieldName", combinator)
$f("alias", "fieldName", combinator)
$f("alias", $a.FN(...))
```

**Side by side:**

```js
// alias only
$f`ownerEmail``email`
$f("ownerEmail", "email")

// field with args, no alias
$f`posts ${varFilters($p.gt("publishedAt","DateTime"))}`
$f("posts", varFilters($p.gt("publishedAt","DateTime")))

// alias + field + args
$f`myPosts``posts ${varFilters($p.gt("publishedAt","DateTime"))}`
$f("myPosts", "posts", varFilters($p.gt("publishedAt","DateTime")))

// aggregate with alias
$f`postCount ${$a.COUNT(over("posts"))}`
$f("postCount", $a.COUNT(over("posts")))

// aggregate with alias and args
$f`recentPostsTotal ${$a.COUNT(over("posts"), varFilters($p.gt("publishedAt","DateTime")))}`
$f("recentPostsTotal", $a.COUNT(over("posts"), varFilters($p.gt("publishedAt","DateTime"))))
```

**In a `selectionSet`:**

```js
// tag form
selectionSet(
    "_docID",
    $f`ownerEmail``email`,
    $f`myPosts``posts ${varFilters($p.gt("publishedAt","DateTime"))}`,
    $f`postCount ${$a.COUNT(over("posts"))}`,
)

// function-call form
selectionSet(
    "_docID",
    $f("ownerEmail", "email"),
    $f("myPosts", "posts", varFilters($p.gt("publishedAt","DateTime"))),
    $f("postCount", $a.COUNT(over("posts"))),
)
```

**As a computed property key (sub-selection):**

```js
// tag form
{ [$f`myPosts``posts ${varFilters(...)}`]: [ "title", "publishedAt" ] }

// function-call form
{ [$f("myPosts", "posts", varFilters(...))]: [ "title", "publishedAt" ] }
```

**Via `$m`:**

```js
// tag form
$m($f`myPosts``posts ${varFilters(...)}`, [ "title", "publishedAt" ])

// function-call form
$m($f("myPosts", "posts", varFilters(...)), [ "title", "publishedAt" ])
```

The choice between forms is purely stylistic. The tag form is more compact and reads left-to-right as `alias: field` — matching GraphQL's own rendering. The function-call form is immediately readable to anyone familiar with conventional JS and maps directly to how other language ports express the same concept.

### Aggregates

DefraDB supports several aggregate functions inside selection-sets: `COUNT`, `MAX`, `SUM`, `MIN`, `AVG`, etc. The DSL exposes them through the `$a` helper proxy.

#### `$a` Aggregate Helper

`$a.<FN>(..)` produces a `$f`-style token usable directly as a selection-set entry. Any GraphQL-name function is accepted (so `$a.COUNT`, `$a.MAX`, `$a.SUM`, `$a.MIN`, `$a.AVG`, etc all work; the proxy doesn't restrict to a fixed list).

It accepts the same chunks any field-level reference accepts: `over(..)`, `varArgs(..)`, `litArgs(..)`, `varFilters(..)`, `litFilters(..)`, and the `GROUP(..)` selector (see below).

Inline (no alias):

```js
selectionSet(
    // ..
    $a.COUNT(
        over("books"),
        litFilters($p.lit.eq("isPublished",true))
    )
    // ..
)
```

Produces:

```graphql
COUNT(
    books: {
        filter: {
            isPublished: { _eq: true }
        }
    }
)
```

To alias the result, wrap the `$a.<FN>(..)` token in an `$f` template-tag interpolation:

```js
selectionSet(
    // ..
    $f`publishedBooks ${$a.COUNT(
        over("books"),
        litFilters($p.lit.eq("isPublished",true))
    )}`
    // ..
)
```

Produces:

```graphql
publishedBooks: COUNT(
    books: {
        filter: {
            isPublished: { _eq: true }
        }
    }
)
```

The `over(..)` option-key helper scopes the rest of the argument definitions to the relation/list field being aggregated. Even if you pass only `over` without any other arguments, the GraphQL-required `books: {}` wrapper form will still be emitted.

**NOTE:** `over("books")` produces the same object as `$m("over","books")`, so they're interchangeable.

#### Grouping

For grouped aggregates, two helpers work together:

* `groupBy(field1, field2, ..)`: operation-level option-key helper, declares the grouping fields. Field names render as bare tokens (no quotes) in the GraphQL output.

* `GROUP(field, ...combinators)`: aggregate sub-selector, used as a combinator inside `$a.<FN>(..)`. Specifies which field the aggregate operates on within each group, and optionally takes its own `varFilters` / `litFilters` / `varArgs` / `litArgs` to refine the group selection. Any variable type-defs declared inside `GROUP` (via `varFilters` etc.) are hoisted up to the operation parameter list, just like any other variable reference.

The `$m("GROUP", [..])` selection-set entry is also available for including the underlying grouped records themselves as a sub-selection.

A full grouped-aggregate query, combining all three, and aliasing (`maxAge`) the aggregate field in the selection set:

```js
DQL.collection("User").get(
    groupBy("Age"),
    selectionSet(
        "Age",
        $f`maxAge ${$a.MAX(GROUP("Age"))}`,
        $m("GROUP",[ "firstName" ])
    )
)
```

Which produces:

```graphql
query GetUser {
    User: User(groupBy: [Age]) {
        Age
        maxAge: MAX(GROUP: { field: Age })
        GROUP {
            firstName
        }
    }
}
```

A grouped aggregate with a filter, demonstrating var-def hoisting from inside `GROUP`:

```js
DQL.collection("User").get(
    selectionSet(
        $a.MAX(
            GROUP("Age",
                varFilters($p.gt("Age","Int"))
            )
        )
    )
)
```

Which produces:

```graphql
query GetUser($Age: Int) {
    User: User {
        MAX(GROUP: {
            field: Age,
            filter: { Age: { _gt: $Age } }
        })
    }
}
```

#### Collection-Root Aggregates

Aggregates can also appear at the operation root (i.e., not nested inside another selection-set). Per-collection API instances expose these aggregate function names, such as `COUNT(..)`, `MAX(..)`, etc:

```js
DQL.collection("Book").COUNT(
    litFilters($p.lit.eq("isPublished",true))
)
```

Produces:

```graphql
query CountBook {
    COUNT(
        Book: {
            filter: {
                isPublished: { _eq: true }
            }
        }
    )
}
```

The collection name passed to `.collection(..)` is automatically used as the `over` target — no need (and no way) to specify it explicitly at this position. The operation name is derived from the function name (`CountBook`, `MaxBook`, etc., with title-case formatting). The result's `resultName` is the bare function name (`COUNT`, `MAX`, etc.), since no alias is generated at this position.

The result object is the same query-builder result as `get(..)` / `add(..)` / etc., decorated with `tap(..)` (and `exec(..)` when a transport is wired up).

**NOTE:** The collection instance API exposes all the aggregate functions (e.g., `SUM`, `MAX`, `AVG`, `MIN`, etc).

## Underlying Query Builder

If you want to build a DefraDB query whose shape doesn't map cleanly to `collection().get/add/update/delete` — for example, a custom root field, or a query that mixes multiple operations — you can drop down to the underlying composer's `queryBuilder(..)` directly. This plugin's `createDefraDBComposer(..)` exposes the same options surface (filters, inputs, aggregates, etc.) for it, plus a `root(..)` option-key helper that lets you specify the root field shape explicitly. See composer's [README](https://github.com/gql-x/composer/blob/main/README.md) for the bare `queryBuilder(..)` API.

The `root(..)` helper supports two forms — the 2-arg form is symmetric with composer's `root(field, alias)`, and the 3-arg form adds an `over` third argument for operation-root aggregates and other `over`-wrapped root shapes.

`root(field)` — bare field, no wrapper:

```js
root("User")
// { root: { field: "User" } }
```

Produces a root like `User(..) { .. }`.

`root(field, alias)` — aliased root:

```js
root("currentUser","user")
// { root: { field: "currentUser", alias: "user" } }
```

Produces a root like `currentUser: user(..) { .. }`.

`root(field, alias, over)` — function-form root, wrapping arguments under the `over` target (used for operation-root aggregates), with an explicit alias on the root:

```js
root("COUNT","userCount","User")
// { root: { field: "COUNT", alias: "userCount", over: "User" } }
```

Produces a root like `userCount: COUNT(User: { .. })`.

The alias is required in this form, not optional. Aggregate-style roots almost always want a meaningful alias on the result (e.g., `userCount` vs. the bare `COUNT`), so requiring it explicitly keeps the 2-arg form `root(field, alias)` consistent with composer's signature. If you don't want a different name in the result, just pass the field name itself as the alias: `root("COUNT","COUNT","User")`.

When `over` is set, the `namePrefix` is applied to `over` (e.g., `Dev_User`) rather than to `field`. When `over` is not set, `namePrefix` is applied to `field` directly and an automatic alias back to the unprefixed name is emitted.

## Tests

A test suite is included in this repository, as well as the npm package distribution. The default test behavior runs the test suite using the files in `src/`.

To run the test suite:

```
npm test
```

## License

[![License](https://img.shields.io/badge/license-MIT-a1356a)](LICENSE.txt)

All code and documentation are (c) 2026 Kyle Simpson and released under the [MIT License](http://getify.mit-license.org/). A copy of the MIT License [is also included](LICENSE.txt).
