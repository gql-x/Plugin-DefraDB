# @gql-x/plugin-defradb

A plugin for [`@gql-x/composer` (GraphQL query-string DSL)](https://github.com/gql-x/composer) extending DSL support for the GraphQL flavor of [DefraDB](https://source.network/defradb): Source Network's open-source, peer-to-peer document database with native GraphQL and CRDT-based sync.

This package produces GraphQL **text** in the shape DefraDB expects, including:

* filter payloads with rich comparator vocabularies

* structured mutation inputs

* aggregate functions at field-level and operation-root positions

* grouped aggregates, `over(...)`-wrapped relation arguments

Use it to author queries in source files for AOT compilation, generate static `.graphql` artifacts as a build step, build dev tooling, or compose dynamic queries at runtime for handoff to whatever execution layer you've got.

**NOTE:** For executing queries directly against a live DefraDB instance over HTTP (with transaction support), there's a companion plugin: [`@gql-x/plugin-defradb-transport-http`](https://github.com/gql-x/plugin-defradb-transport-http). *This* `plugin-defradb` package itself produces only query strings.

## Relationship to `@gql-x/composer`

`@gql-x/plugin-defradb` is built on [`@gql-x/composer`](https://github.com/gql-x/composer), the generic GraphQL query-string Composer. Composer handles variable bookkeeping, dynamic composition, selection-set rendering, and the field/argument/root-level extension seams that this plugin uses to add DefraDB-specific vocabulary.

This plugin is an illustration of composer's extensibility architecture in action. It demonstrates how a layered plugin adds backend-specific syntax (filters, aggregates, etc.) on top of the bare composer without modifying Composer itself. Plugin authors targeting other GraphQL-speaking backends will find this package's source useful as a reference; see composer's [EXTENSIBILITY.md](https://github.com/gql-x/composer/blob/main/EXTENSIBILITY.md) for the more information.

## Design Overview

Two primary goals motivate the design (inherited from Composer):

1. **Reduce variable bookkeeping.** Annotate a variable's type at its use site; the builder hoists the declaration into the operation's parameter list and deduplicates automatically.

2. **First-class dynamic composition.** Query fragments (filters, inputs, selection-sets, order clauses) are plain JS values that can be conditionally included, named, passed around, and combined using ordinary host-language logic. No string templating, no parameter-list maintenance.

A third design theme: meaning is conveyed by explicit names (`selectionSet`, `varFilters`, `litInputs`) rather than syntactic position. This trades raw-GraphQL positional convention for label-driven composition that can be reordered to foreground whatever matters most about a given query.

For a fuller discussion of design rationale, tradeoffs, and audiences, see composer's [DESIGN.md](https://github.com/gql-x/composer/blob/main/DESIGN.md).

## Type Name Prefixing

DefraDB doesn't currently support native collection namespacing, so this DSL approximates it through auto-prefixing of schema names. The prefix is applied to all non-built-in variable and input types, and to root field names.

For predictability, a prefixed root field name (e.g., `add_Dev_User`) is automatically aliased back to its non-prefixed form (`add_User`) in the result set.

For example, with `namePrefix: "Dev_"`, `User` automatically gets prefixed to `Dev_User` (i.e., `add_User: add_Dev_User`) to match what's actually in your schema. But the result set uses the alias (original) name (`add_User`).

The set of non-prefixed types extends the GraphQL spec built-ins with these additional DefraDB-specific types: `JSON`, `DateTime`, `Ordering`, `Commit`, `Blob`, `_commits`.

## Features

In addition to the core variable hoisting and dynamic composition described above, this DSL offers:

* Two kinds of fluent helpers: option-key helpers (`varFilters(..)`, `selectionSet(..)`, `over(..)`, `groupBy(..)`, etc.) and unit-producing helpers (`$p(..)`, `$a`, and `GROUP(..)`); both produce the same plain JS object structures the Composer accepts directly. These helpers reduce repetition and visual tax, but their object literal equivalents are always accepted as alternatives, or for mix-and-match.

* Short-hand helpers for common arguments (`input`, `filter`) in both literal-based and variable-based forms, at both operation and field level (if applicable)

* Aggregate function support (`COUNT`, `MAX`, `SUM`, `MIN`, `AVG`, etc.) at both operation-root and selection-set field-level positions, along with `groupBy` / `GROUP` for grouped aggregates

## At a Glance

Consider a DefraDB GraphQL query like the one below; fetching a user by ID, filtering by a search term against either the first or last name, created since some date, and including a count of their recent posts:

```graphql
query GetUser(
    $docID: [ID!],
    $searchTerm: String,
    $sinceDate: DateTime
) {
    User: Dev_User(
        docID: $docID,
        filter: {
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

* **Nesting tax.** The filter syntax is heavy on braces and repeated field names. Every comparator is a two-level `{ field: { _op: $var } }` shape, with repetition between field name and matching variable name.

* **Sigil bookkeeping.** Every variable carries a `$` everywhere it appears, and every operator carries a leading `_`. Easy to typo, easy to forget.

Here's the DSL equivalent:

```js
DQL.collection("User").get(
    varArgs($v("docID","[ID!]")),  // <-- helpers from core Composer
    varFilters(
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
        )}`
    )
)
```

**NOTE:** The `$f` helper above is shown in its JS-specific tagged-template form (``` $f`alias``field` ```). It also supports a traditional function-call form (`$f(alias,field)`).

The most obvious difference is that there's no pre-definition of variables/types; the DSL internally tracks (and de-duplicates/de-conflicts) variable annotations *in place* as used, and generates the necessary variable type definitions in the resulting query text.

## Getting Started

```js
import { createDefraDBComposer } from "@gql-x/plugin-defradb";

var DQL = createDefraDBComposer({
    namePrefix: "Dev_",
});

var query = DQL.collection("User").get(
    DQL.varArgs($v("docID","[ID!]")),
    DQL.selectionSet("firstName","lastName")
);

console.log(query.text);
// "query GetUser($docID:ID) { User: Dev_User(docID:$docID) { firstName lastName } }"
```

`createDefraDBComposer()` returns a plugin instance -- conventionally named `DQL` in these docs -- which exposes the entire DSL surface: helpers, builders, collection accessors, and optionally transport-defined methods; all helpers are exposed per-instance.

The result of `DQL.collection(...).get(...)` (and other collection API methods) is a query-result object with `text`, `opName`, `resName`, and `kind` properties; see [Composer Query Result](#composer-query-result) below.

**NOTE:** For executing queries against a live DefraDB instance over HTTP, use [`@gql-x/plugin-defradb-transport-http`](https://github.com/gql-x/plugin-defradb-transport-http) instead; its entry point bundles this package's query-building surface with a transport that offers `exec()` and transaction handling methods.

## Fluent Helpers vs. Object Literal Forms

This DSL provides two families of helpers, and both produce plain JS object structures that Composer consumes:

1. **Option-key helpers** like `varFilters(..)`, `litInputs(..)`, `over(..)`, `groupBy(..)`, etc. Each produces a single-property object keyed by its option name. They're passed as variadic arguments to `get(..)` / `add(..)` / `query(..)` etc.

    In other words, `varFilters(..)` produces `{ varFilters: .. }`.

2. **Unit-producing helpers** like `$p.<op>(..)`, `$a.<FN>(..)`, `GROUP(..)`. They produce structural object units for the inside of those options.

    In other words, `$p.eq(..)` produces a `{ field: { _eq: value } }` shaped object.

Every helper has an equivalent object literal form, and the Composer accepts either form interchangeably:

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

The object literal forms are the base. The helpers exist as sugar on top, to reduce repetition and visual syn-tax. If a helper doesn't fit a particular shape cleanly, drop down to an object literal for that bit.

## Plugin API Overview

To construct an instance of this plugin for use in your application:

```js
import { createDefraDBComposer } from "@gql-x/plugin-defradb";

var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
```

`DQL` is the plugin instance -- a DefraDB extended instance of the underlying GraphQL Composer. It includes all methods inherited from Composer (`raw(..)`, `query(..)`, `operationName(..)`, `$f`, etc), as well as DefraDB-specific helpers.

### `createDefraDBComposer(opts)`

Initializes an instance of the plugin.

Pass in an optional object with the following configurations to customize the instance:

* `namePrefix` (string, default: `""`): sets the namespace prefix (e.g., `"Dev_"`)

* `transport` (object, optional): a transport object whose methods are spread directly onto the returned instance. The plugin doesn't introspect the transport; whatever methods it provides become methods on the instance. Pass this when you have an execution layer you want the instance to expose; otherwise, the returned instance is purely a query-string builder.

The return value of `createDefraDBComposer(..)` is a plugin instance.

### Plugin Instance

In addition to the methods/helpers inherited from Composer, the plugin instance offers these two main methods (which can be fluently chained together (`DQL.prefix("Dev_").collection("User")...`):

* `prefix(..)`: returns a sibling plugin instance with a different prefix (the original is unchanged)

* `collection(..)`: specifies the collection to use for the operation (e.g., `"User"`), returns a per-collection API (see below)

Additionally, the following DefraDB-specific helpers are included:

* `$p`: helper for composing filter (aka "predicate") units (variable-based and literal-based); also includes `$p.lit.*`, `$p.any`, `$p.all`, etc

* `$a`: helper proxy for field-level aggregate functions (`COUNT`, `SUM`, `MAX`, `MIN`, `AVG`, etc) in selection-sets

* `varInputs(..)`, `litInputs(..)`, `varFilters(..)`, `litFilters(..)`, `root(..)`, `over(..)`, `groupBy(..)`, `GROUP(..)`, and `actionPrefix(..)`

**NOTE:** If `transport` is specified in the call to `createDefraDBComposer(..)`, it may define additional methods that will be provided on the plugin instance. For example, when paired with `@gql-x/plugin-defradb-transport-http`, the plugin instance additionally exposes `exec(..)`, `hasActiveTransaction()`, `startTransaction(..)`, `commitTransaction()`, and `discardTransaction()`. Refer to the transport package's documentation for more info.

### Per-Collection API

The `collection(..)` method binds a collection name and returns a focused API for type DefraDB CRUD-styles operations on that collection:

* `get(..)`: produces strings shaped like `query GetUser(..) { User(..) { .. } }`

* `add(..)`: produces strings shaped like `mutation AddUser(..) { add_User(..) { .. } }`

* `update(..)`: produces strings shaped like `mutation UpdateUser(..) { update_User(..) { .. } }`

* `delete(..)`: produces strings shaped like `mutation DeleteUser(..) { delete_User(..) { .. } }`

* `<AggregateFn>(..)`: `<AggregateFn>` is any GraphQL-name function (e.g., `COUNT`, `MAX`, `SUM`, etc); produces strings shaped like `query CountUser(..) { COUNT(..) }`

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

### Composer Query Result

Just like the inherited `query(..)` / `mutation(..)` / etc methods, `get(..)`, `add(..)`, `update(..)`, `delete(..)`, and all `<AggregateFn>(..)` methods return a query-builder result object from Composer, which has the following properties:

* `text`: the ready-to-execute query text

* `opName`: the operation name embedded in the query text (e.g., `GetUser`), to pass along to the DefraDB endpoint

* `resName`: the result set name (e.g., `User`)

* `kind`: the kind of query (`"query"`, `"mutation"`, `"subscription"`)

Additionally, this query-builder result object is decorated with a `tap(..)` method (for continued fluent chained-method calling):

* `tap(fn)`: a function that will be invoked with the query builder result and then return the same context; often used to `console.log(query.text)` for debugging purposes

The query result is purely a string-builder output that you can hand off to whatever execution layer you prefer.

Example:

```js
var query = DQL.collection("User").get( /* .. */ );
// { text: "..", opName: "GetUser", .. }

DQL.collection("User")
    .get( /* query builder options */ )
    .tap(query => console.log(query.text))
```

### Collection Method Composer Options

The `get(..)`, `add(..)`, `update(..)`, `delete(..)`, and `<AggregateFn>(..)` methods all accept variadic option-key helper calls (and/or options objects). The following defradb-specific query aspects can be specified, either via their corresponding option-key helper or as a property on an options object:

* `varFilters` (option): specifies a variable-valued filter; a `filter` argument whose comparator values are variable type-defs that the builder hoists into the operation parameter list. Short-hand for the `filter` key inside Composer's `varArgs`.

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

* `litFilters` (option): specifies a literal-valued filter; a `filter` argument whose values are literals (not variable references). Short-hand for the `filter` key inside composer's `litArgs`.

    For example:

    ```js
    litFilters(
        $p.lit.eq("firstName","John")
    )
    ```

    Produces: `filter: { firstName: { _eq: "John" } }`.

* `varInputs` (option): specifies a variable-valued input payload; an `input` argument whose values are variable type-defs hoisted into the operation parameter list. Short-hand for the `input` key inside Composer's `varArgs`.

    For example:

    ```js
    varInputs(
        $v("title","jobTitle","String"),
        $v("isPublished","Boolean")
    )
    ```

    Produces operation parameters: `$jobTitle: String, $isPublished: Boolean`, and operation arguments: `input: { title: $jobTitle, isPublished: $isPublished }`.

* `litInputs` (option): specifies a literal-valued input payload; an `input` argument whose values are literals. Short-hand for the `input` key inside composer's `litArgs`.

    For example:

    ```js
    litInputs(
        $m("title","Hello World"),
        $m("isPublished",true)
    )
    ```

    Produces: `input: { title: "Hello World", isPublished: true }`.

* `selectionSet` (option): specifies the fields to include in the selection-set. Defaults to including just `"_docID"`. See composer's [README](https://github.com/gql-x/composer/blob/main/README.md) for the full `selectionSet` reference; the defradb default of `"_docID"` is the only behavior difference.

    For example:

    ```js
    selectionSet(
        "firstName",
        "lastName",
        $f`ownerEmail``email`
    )
    ```

    Produces: `firstName lastName ownerEmail: email`.

    Each argument to `selectionSet(..)` is a selection entry: a bare string for a scalar field, an `$f` helper for an aliased or argument-bearing field reference, an `$a.<FN>(..)` aggregate token (see "Aggregates" below), or an object-keyed entry for sub-selections.

    To omit the selection-set block entirely (e.g., for aggregate-only root queries): `selectionSet(null)`, `selectionSet($f.noSelection)`, or `selectionSet.none()`.

* `groupBy` (option): specifies the field names to group results by, for use with grouped aggregates. Field names are rendered as bare tokens (not quoted strings) in the GraphQL output, matching DefraDB's expected syntax. See the "Grouping" subsection under "Aggregates" below.

    For example:

    ```js
    groupBy("Age","Country")
    ```

    Produces: `groupBy: [Age, Country]`.

* `GROUP` (aggregate sub-selector helper): produces a unit for use as a combinator inside `$a.<FN>(..)`, specifying which field the aggregate operates on within each group; not a top-level option itself. See the "Grouping" subsection under "Aggregates" below for more information.

    For example:

    ```js
    $a.MAX(GROUP("Age"))
    ```

    Produces: `MAX(GROUP: { field: Age })`.

* `actionPrefix` (option): sets a prefix applied to the root field name and its alias in the rendered output. Normally handled automatically by the collection API: `add(..)`, `update(..)`, and `delete(..)` internally set `add_`, `update_`, and `delete_` respectively.

    Exposed as a helper for cases where you're building a CRUD-style mutation directly via `mutation(..)` rather than through `collection()`. Most easily produced via the `actionPrefix(..)` option-key helper.

    ```js
        actionPrefix("add_")
        // { actionPrefix: "add_" }
    ```

    When combined with `namePrefix`, the action prefix applies to both the rendered field name and the alias (e.g. `add_User: add_Dev_User`).

The Composer-inherited helpers `varArgs`, `litArgs`, and `varDefs` are also accepted directly; see [Composer](https://github.com/gql-x/composer/blob/main/README.md) for more info. The shorthand options above (`varFilters` / `litFilters` / `varInputs` / `litInputs`) cover the most common DefraDB-specific use cases; fall back to the broader `varArgs` / `litArgs` for anything that falls outside those shapes.

#### DefraDB-specific Helpers

* `$p` (filter DSL helper): a composable helper for building filter (aka, predicate) units for `litFilters` / `varFilters` (and the `filter` keys inside `litArgs` / `varArgs`). Reduces the syntactic tax of nested filter payloads.

    `$p(unit1, unit2, ..)` composes/merges multiple filter units; it takes the place of an object literal on the right side of `varFilters:` / `litFilters:`, merging the individual units passed in.

    ```js
    varFilters: $p(
        $p.eq("firstName","String"),
        $p.eq("lastName","userLastName","String")
    )
    ```

    Produces operation parameters: `$firstName: String, $userLastName: String`, and operation arguments: `filter: { firstName: { _eq: $firstName }, lastName: { _eq: $userLastName } }`.

    **NOTE:** Since `$p(..)` composes object units, the units it accepts can also be object-spread directly into a regular object literal as a more flexible alternative, useful when mixing DSL units with plain object properties. For example:

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

    Scoped composition: `$p("field", unit1, unit2, ..)` scopes merged child units under a field key:

    ```js
    varFilters: $p("user",
        $p.eq("_docID", "userDocID", "ID"),
        $p.eq("isEnabled", "Boolean")
    )
    ```

    Produces operation parameters: `$userDocID: ID, $isEnabled: Boolean`, and operation arguments: `filter: { user: { _docID: { _eq: $userDocID }, isEnabled: { _eq: $isEnabled } } }`.

    Combinators: `$p.and(..)`, `$p.or(..)`, and `$p.not(..)` produce `_and` / `_or` / `_not` units. These unit forms are usable directly at the top level in place of the `$p(..)` composer, since they each return a complete filter payload on their own. `$p.and(..)` and `$p.or(..)` wrap their units in an array; `$p.not(..)` merges its units into a single object.

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

    The remaining helpers below all produce units that must be passed into `$p(..)` (or `$p("field", ..)`, or `$p.and(..)` / `$p.or(..)` / `$p.not(..)`) to be used as a filter payload.

    Variable-style operators: `$p.<op>(..)` produces a field-centered comparator unit. Any property name is interpreted as the operator name, with `_` prepended if not already present (`$p.eq` → `_eq`, `$p._in` → `_in`).

    The 2-arg form `$p.<op>(field,type)` defaults the variable name to the field name:

    ```js
    $p.eq("firstName","String")
    // unit: { firstName: { _eq: "String" } }
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
    // unit: { firstName: { _eq: { userFirstName: "String" } } }
    // type def: $userFirstName: String, filter: { firstName: { _eq: $userFirstName } }
    ```

    Literal-style operators: `$p.lit.<op>(field,value)` produces a literal filter unit (for use in `litFilters` / `litArgs.filter`).

    ```js
    $p.lit.eq("isEnabled", true)
    // unit: { isEnabled: { _eq: true } }
    // filter: { isEnabled: { _eq: true } }
    ```

    Relation/list traversal: `$p.any(..)` and `$p.all(..)` produce `_any` / `_all` units, used for filtering across relation fields (multi-element references) or scalar list fields. They merge their units into a single object payload (not an array, unlike `$p.and` / `$p.or`).

    For relation fields (objects with sub-fields), pass field-centered comparator units directly:

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

    **NOTE:** The key semantic distinction: `$p.any(..)` / `$p.all(..)` express "elements **where** [field] matches X" — the inner units reference sub-fields of relation objects. `$p.any.is(..)` / `$p.all.are(..)` express "elements **that are** X" — an identity check on scalar list elements themselves. The `.is(..)` / `.are(..)` forms invert field-centered units accordingly.

The Composer-inherited helpers `operationName`, `$f`, `$t`, `$v`, and `$m` are also available on the plugin instance; see [Composer](https://github.com/gql-x/composer/blob/main/README.md) for more info.

### Field-Level Selections

This plugin inherits all functionality of `$f`, including its tagged-function form (``` $f`alias``field` ```), and regular function-call form (`$f(alias,field)`). See [Composer](https://github.com/gql-x/composer/blob/main/README.md) for more information.

For example:

```js
selectionSet(
    // ..
    $f`userFirstName``firstName`,
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

**WARNING:** DefraDB does *NOT* currently support field-level arguments on scalar fields (like the `firstName` string field, above). It's possible DefraDB might support them (e.g., `filter`) sometime in the future, so this an inert/placeholder DSL feature for now; DefraDB will currently fail on such usage!

Field-level arguments *are* currently allowed on object fields with sub-selection (see below), as well as the aggregate functions (see "Aggregates" below).

To use field-level arguments (and aliases, if desired) on an object field, with sub-selection, pair the `$f` helper with `$m` to produce a computed-property selection-set entry. The `$f` interpolation accepts an array of units (merged together), so the option-key helpers and other unit producers compose naturally inside it:

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

The `$f` interpolation also accepts a single object literal directly, equivalent to the array-of-units form above:

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

### Aggregates

DefraDB supports several aggregate functions inside selection-sets: `COUNT`, `MAX`, `SUM`, `MIN`, `AVG`, etc.

#### `$a` Field-Level Aggregate Helper

`$a.<FN>(..)` produces a `$f`-style token usable directly as a selection-set entry for a field-level aggregate. Any GraphQL-name function is accepted; `$a.COUNT`, `$a.MAX`, `$a.SUM`, `$a.MIN`, `$a.AVG`, etc all work; the proxy doesn't restrict to a fixed list.

It accepts the same clauses any field-level reference accepts: `over(..)`, `varArgs(..)`, `litArgs(..)`, `varFilters(..)`, `litFilters(..)`, and the `GROUP(..)` selector (see below).

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

**TIP:** A `$m("GROUP", [..])` selection-set entry includes the underlying grouped records themselves as a sub-selection.

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

Aggregates can also appear at the operation root (i.e., not nested inside another selection-set). Per-collection API instances expose these aggregate function names (without `$a`), such as `COUNT(..)`, `MAX(..)`, etc, alongside the other `get(..)`/etc convenience methods:

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

**NOTE:** The collection name passed to `.collection(..)` is automatically used as the `over` target. The operation name is derived from the function name (`CountBook`, `MaxBook`, etc., with title-case formatting). The result's `resName` is the bare function name (`COUNT`, `MAX`, etc.), since no alias is generated at this position.

The result object is the same query-builder result as `get(..)` / `add(..)` / etc., decorated with `tap(..)`.

## Inherited Composer (Query Builder)

If you want to build a DefraDB query whose shape doesn't map cleanly to `collection().get/add/update/delete` -- for example, a custom root field, or a query that mixes multiple operations -- you can drop down to the underlying Composer's `raw(..)` / `query(..)` / etc directly.

This plugin's `createDefraDBComposer(..)` exposes the same options surface (filters, inputs, aggregates, etc.) for it, plus a `root(..)` option-key helper that lets you specify the root field shape explicitly. See [Composer](https://github.com/gql-x/composer/blob/main/README.md) for more info.

The `root(..)` helper supports two forms: the 2-arg form is symmetric with Composer's `root(field, alias)`, and the 3-arg form adds an `over` third argument for operation-root aggregates and other `over`-wrapped root shapes.

`root(field)` bare field, no wrapper:

```js
root("User")
// { root: { field: "User" } }
```

Produces a root like `User(..) { .. }`.

`root(field, alias)` aliased root:

```js
root("user","currentUser")
// { root: { field: "user", alias: "currentUser" } }
```

Produces a root like `currentUser: user(..) { .. }`.

`root(field, alias, over)` — function-form root, wrapping arguments under the `over` target (used for operation-root aggregates), with an optional alias on the root:

```js
root("COUNT","userCount","User")
// { root: { field: "COUNT", alias: "userCount", over: "User" } }
```

Produces a root like `userCount: COUNT(User: { .. })`.

Pass `null` (or `""`) as the alias if you want the root rendered without one:

```js
root("COUNT",null,"User")
// produces: COUNT(User: { .. })
```

An explicit alias is typically what you want (so the result can be addressed by a meaningful name), but it's not required. The 3-arg form keeps the alias slot in second position regardless to preserve symmetry with composer's `root(field, alias)` 2-arg form.

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
