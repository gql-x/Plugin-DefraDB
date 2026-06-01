import assert from "node:assert";
import { module } from "./runner.js";
import { createDefraDBComposer, } from "@gql-x/plugin-defradb";

export const test = module("builder");

var {
	raw, query, mutation, subscription,
	root, selectionSet,
	$f, $t, $v, $m, $p, $a,
	varArgs, litArgs, varDefs,
	varInputs, varFilters, litInputs, litFilters,
	groupBy, GROUP, over, operationName, actionPrefix,
} = createDefraDBComposer();

function normalize(str) {
	return str.replace(/\s+/g, " ").trim();
}

test("collectionName sets operation name and result name", () => {
	var { text, opName, resName } = query({
		collectionName: "User"
	});
	assert.equal(opName, "User");
	assert.equal(resName, "User");
	assert.ok(text.startsWith("query User"));
});

test("namePrefix applies alias and prefixes action field", () => {
	var { text, opName, resName } = query({
		collectionName: "User",
		namePrefix: "Dev_"
	});
	assert.equal(opName, "User");
	assert.equal(resName, "User");
	assert.ok(text.includes("User: Dev_User"));
});

test("operationName null omits name when no var defs", () => {
	var { text, opName, } = query(
		operationName(null),
		root("User")
	);
	assert.equal(opName, null);
	assert.ok(text.startsWith("query {"));
});

test("root with over produces aggregate query", () => {
	var { text, opName, resName, } = query(
		{ namePrefix: "Dev_", },
		operationName(null),
		root("COUNT","UserCount","User"),
		selectionSet(null)	// special case: COUNT() has no sub-selection
	);
	assert.equal(opName, null);
	assert.equal(resName, "UserCount");
	assert.ok(text.includes("COUNT(Dev_User:{})"));
});

test("operationName prefix prepended to collectionName", () => {
	var { text, opName, } = query(
		{ collectionName: "User", },
		operationName("Get")
	);
	assert.equal(opName, "GetUser");
	assert.ok(text.startsWith("query GetUser"));
});

test("kind mutation", () => {
	var { text, } = mutation({
		collectionName: "User",
	});
	assert.ok(text.startsWith("mutation User"));
});

test("operationName null falls back to Query when var defs present", () => {
	var { text, opName, } = query(
		operationName(null),
		root("User"),
		varDefs($v("foo","String"))
	);
	assert.equal(opName, "Query");
	assert.ok(text.startsWith("query Query("));
});

test("operationName null falls back to Mutation for mutation kind", () => {
	var { text, opName, } = mutation(
		operationName(null),
		root("User"),
		varDefs($v("foo","String"))
	);
	assert.equal(opName, "Mutation");
	assert.ok(text.startsWith("mutation Mutation("));
});

test("varFilters hoists variable def and renders filter", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters($p.eq("username","String"))
	);
	assert.ok(text.startsWith("query GetUser($username:String) {"));
	assert.ok(text.includes("User(filter:{username:{_eq:$username}})"));
});

test("litFilters renders literal filter", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		litFilters($p.lit.eq("status","active"))
	);
	assert.ok(text.startsWith("query GetUser {"));
	assert.ok(text.includes(`User(filter:{status:{_eq:"active"}})`));
});

test("varFilters and litFilters merge into single filter arg", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters($p.eq("username","String")),
		litFilters($p.lit.eq("status","active"))
	);
	assert.ok(text.startsWith("query GetUser($username:String) {"));
	assert.ok(text.includes(`User(filter:{username:{_eq:$username},status:{_eq:"active"}})`));
});

test("varInputs hoists variable def and renders input", () => {
	var { text, } = mutation(
		operationName("Add"),
		root("User"),
		varInputs($v("username","String"))
	);
	assert.ok(text.startsWith("mutation AddUser($username:String) {"));
	assert.ok(text.includes("User(input:{username:$username})"));
});

test("litInputs renders literal input", () => {
	var { text, } = mutation(
		operationName("Add"),
		root("User"),
		litInputs($m("status","active"))
	);
	assert.ok(text.startsWith("mutation AddUser {"));
	assert.ok(text.includes(`User(input:{status:"active"})`));
});

test("varInputs and litInputs merge into single input arg", () => {
	var { text, } = mutation(
		operationName("Add"),
		root("User"),
		varInputs($v("username","String")),
		litInputs($m("status","active"))
	);
	assert.ok(text.startsWith("mutation AddUser($username:String) {"));
	assert.ok(text.includes(`User(input:{username:$username,status:"active"})`));
});

test("varArgs renders non-filter/input variable args", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varArgs($v("docID","userDocID","ID"))
	);
	assert.ok(text.startsWith("query GetUser($userDocID:ID) {"));
	assert.ok(text.includes("User(docID:$userDocID)"));
});

test("namePrefix resName is unprefixed alias", () => {
	var { resName, } = query(
		{ namePrefix: "Dev_", },
		operationName("Get"),
		root("User")
	);
	assert.equal(resName, "User");
});

test("varDefs adds variable to parameter list without arg position", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varDefs($v("sinceDate","DateTime"))
	);
	assert.ok(text.startsWith("query GetUser($sinceDate:DateTime) {"));
	assert.ok(!text.includes("sinceDate:$sinceDate"));
});

test("litArgs renders literal arg", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		litArgs($m("limit",50))
	);
	assert.ok(text.startsWith("query GetUser {"));
	assert.ok(text.includes("User(limit:50)"));
});

test("variable deduplication — same var in two filter positions declared once", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p.eq("createdAt","sinceDate","DateTime"),
			$p("emails",$p.gt("verified","sinceDate","DateTime"))
		)
	);
	assert.ok(text.startsWith("query GetUser($sinceDate:DateTime) {"));
});

test("varArgs 2-arg form", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varArgs($v("limit","Int"))
	);
	assert.ok(text.startsWith("query GetUser($limit:Int) {"));
	assert.ok(text.includes("User(limit:$limit)"));
});

test("root with alias", () => {
	var { text, resName, } = query(
		operationName(null),
		root("COUNT","UserCount","User")
	);
	assert.equal(resName, "UserCount");
	assert.ok(text.includes("UserCount: COUNT"));
});

test("_docID in filter treated as field name not operator", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters($p.eq("_docID","ID"))
	);
	assert.ok(text.startsWith("query GetUser($_docID:ID) {"));
	assert.ok(text.includes("User(filter:{_docID:{_eq:$_docID}})"));
});

test("_docID in filter with rename-var treated as field name", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters($p.eq("_docID","targetDocID","ID"))
	);
	assert.ok(text.startsWith("query GetUser($targetDocID:ID) {"));
	assert.ok(text.includes("User(filter:{_docID:{_eq:$targetDocID}})"));
});

test("_docID inside _any treated as field name", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p("emails",
				$p.any(
					$p.eq("_docID","emailDocID","ID")
				)
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($emailDocID:ID) {"));
	assert.ok(text.includes("emails:{_any:{_docID:{_eq:$emailDocID}}}"));
});

test("_docID inside _not treated as field name", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p.not(
				$p.eq("_docID","excludeDocID","ID")
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($excludeDocID:ID) {"));
	assert.ok(text.includes("_not:{_docID:{_eq:$excludeDocID}}"));
});

test("_docID inside _or treated as field name", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p.or(
				$p.eq("_docID","ID"),
				$p.eq("username","String")
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($_docID:ID,$username:String) {"));
	assert.ok(text.includes("_or:[{_docID:{_eq:$_docID}},{username:{_eq:$username}}]"));
});

test("_or in filter renders array of filter objects", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p.or(
				$p.eq("firstName","String"),
				$p.eq("lastName","String")
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($firstName:String,$lastName:String) {"));
	assert.ok(text.includes("filter:{_or:[{firstName:{_eq:$firstName}},{lastName:{_eq:$lastName}}]}"));
});

test("_and in filter renders array of filter objects", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p.and(
				$p.eq("isEnabled","Boolean"),
				$p.eq("isVerified","Boolean")
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($isEnabled:Boolean,$isVerified:Boolean) {"));
	assert.ok(text.includes("filter:{_and:[{isEnabled:{_eq:$isEnabled}},{isVerified:{_eq:$isVerified}}]}"));
});

test("_not in filter renders merged object", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p.not(
				$p.eq("isDeleted","Boolean"),
				$p.eq("isArchived","Boolean")
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($isDeleted:Boolean,$isArchived:Boolean) {"));
	assert.ok(text.includes("filter:{_not:{isDeleted:{_eq:$isDeleted},isArchived:{_eq:$isArchived}}}"));
});

test("_or nested inside _not", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p.not(
				$p.or(
					$p.eq("isDeleted","Boolean"),
					$p.eq("isArchived","Boolean")
				)
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($isDeleted:Boolean,$isArchived:Boolean) {"));
	assert.ok(text.includes("filter:{_not:{_or:[{isDeleted:{_eq:$isDeleted}},{isArchived:{_eq:$isArchived}}]}}"));
});

test("_and with nested _or", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p.and(
				$p.eq("isEnabled","Boolean"),
				$p.or(
					$p.eq("firstName","String"),
					$p.eq("lastName","String")
				)
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($isEnabled:Boolean,$firstName:String,$lastName:String) {"));
	assert.ok(text.includes("filter:{_and:[{isEnabled:{_eq:$isEnabled}},{_or:[{firstName:{_eq:$firstName}},{lastName:{_eq:$lastName}}]}]}"));
});

test("_not inside _or", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p.or(
				$p.eq("isEnabled","Boolean"),
				$p.not(
					$p.eq("isDeleted","Boolean")
				)
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($isEnabled:Boolean,$isDeleted:Boolean) {"));
	assert.ok(text.includes("filter:{_or:[{isEnabled:{_eq:$isEnabled}},{_not:{isDeleted:{_eq:$isDeleted}}}]}"));
});

test("combinators mixed with regular field filters", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p.eq("username","String"),
			$p.not(
				$p.eq("isDeleted","Boolean"),
				$p.eq("isArchived","Boolean")
			)
		),
		litFilters(
			$p.lit.eq("status","active")
		)
	);
	assert.ok(text.startsWith("query GetUser($username:String,$isDeleted:Boolean,$isArchived:Boolean) {"));
	assert.ok(text.includes(`filter:{username:{_eq:$username},_not:{isDeleted:{_eq:$isDeleted},isArchived:{_eq:$isArchived}},status:{_eq:"active"}}`));
});

test("_or with 3-arg rename form deduplicates variable", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p.or(
				$p.eq("firstName","searchTerm","String"),
				$p.eq("lastName","searchTerm","String")
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($searchTerm:String) {"));
	assert.ok(text.includes("filter:{_or:[{firstName:{_eq:$searchTerm}},{lastName:{_eq:$searchTerm}}]}"));
});

test("_and with 3-arg rename form", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p.and(
				$p.eq("createdAt","sinceDate","DateTime"),
				$p.eq("updatedAt","sinceDate","DateTime")
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($sinceDate:DateTime) {"));
	assert.ok(text.includes("filter:{_and:[{createdAt:{_eq:$sinceDate}},{updatedAt:{_eq:$sinceDate}}]}"));
});

test("_not with 3-arg rename form", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p.not(
				$p.eq("firstName","excludeName","String"),
				$p.eq("lastName","excludeName","String")
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($excludeName:String) {"));
	assert.ok(text.includes("filter:{_not:{firstName:{_eq:$excludeName},lastName:{_eq:$excludeName}}}"));
});

test("_any.is scalar list renders correctly", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p("tags",
				$p.any.is($p.eq("myTag","String"))
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($myTag:String) {"));
	assert.ok(text.includes("filter:{tags:{_any:{_eq:$myTag}}}"));
});

test("_all.are scalar list renders correctly", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p("tags",
				$p.all.are($p.in("myTags","[String]"))
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($myTags:[String]) {"));
	assert.ok(text.includes("filter:{tags:{_all:{_in:$myTags}}}"));
});

test("_any relation field multiple conditions", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p("emails",
				$p.any(
					$p.eq("email","matchEmail","String"),
					$p.eq("altEmail","matchEmail","String")
				)
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($matchEmail:String) {"));
	assert.ok(text.includes("filter:{emails:{_any:{email:{_eq:$matchEmail},altEmail:{_eq:$matchEmail}}}}"));
});

test("_any relation field with nested _and", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p("emails",
				$p.any(
					$p.eq("email","matchEmail","String"),
					$p.and(
						$p.eq("emailTLD","matchEmailTLD","String"),
						$p.eq("emailHost","matchEmailHost","String")
					)
				)
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($matchEmail:String,$matchEmailTLD:String,$matchEmailHost:String) {"));
	assert.ok(text.includes("filter:{emails:{_any:{email:{_eq:$matchEmail},_and:[{emailTLD:{_eq:$matchEmailTLD}},{emailHost:{_eq:$matchEmailHost}}]}}}"));
});

test("_all relation field with nested _or", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters(
			$p("emails",
				$p.all(
					$p.eq("verified","DateTime"),
					$p.or(
						$p.eq("emailTLD","matchEmailTLD","String"),
						$p.eq("emailHost","matchEmailHost","String")
					)
				)
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($verified:DateTime,$matchEmailTLD:String,$matchEmailHost:String) {"));
	assert.ok(text.includes("filter:{emails:{_all:{verified:{_eq:$verified},_or:[{emailTLD:{_eq:$matchEmailTLD}},{emailHost:{_eq:$matchEmailHost}}]}}}"));
});

test("$t bare token in litArgs renders without quotes", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		litArgs($m("order",$m("createdAt",$t.DESC)))
	);
	assert.ok(text.includes("User(order:{createdAt:DESC})"));
});

test("$t.$varName manual variable reference in litArgs", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varDefs($v("sinceDate","DateTime")),
		litFilters($p.lit.gt("createdAt",$t.$sinceDate))
	);
	assert.ok(text.startsWith("query GetUser($sinceDate:DateTime) {"));
	assert.ok(text.includes(`filter:{createdAt:{_gt:$sinceDate}}`));
});

test("$t bare token in litInputs", () => {
	var { text, } = mutation(
		operationName("Add"),
		root("User"),
		litInputs($m("status",$t.ACTIVE))
	);
	assert.ok(text.startsWith("mutation AddUser {"));
	assert.ok(text.includes("User(input:{status:ACTIVE})"));
});

test("$t.$varName manual variable reference in litInputs", () => {
	var { text, } = mutation(
		operationName("Add"),
		root("User"),
		varDefs($v("defaultStatus","String")),
		litInputs($m("status",$t.$defaultStatus))
	);
	assert.ok(text.startsWith("mutation AddUser($defaultStatus:String) {"));
	assert.ok(text.includes("User(input:{status:$defaultStatus})"));
});

test("selectionSet renders string fields", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet("_docID","username","createdAt")
	);
	assert.ok(normalize(text).includes("{ _docID username createdAt }"));
});

test("selectionSet $f alias", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$f`ownerEmail``email`
		)
	);
	assert.ok(normalize(text).includes("{ ownerEmail: email }"));
});

test("selectionSet null omits block", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet($f.noSelection)
	);
	assert.ok(normalize(text).includes("query GetUser { User }"));
});

test("selectionSet $f with field-level varFilters hoists var def", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$m(
				$f`books ${
					varFilters($p.eq("isPublished","Boolean"))
				}`,
				[ "title" ]
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($isPublished:Boolean) {"));
	assert.ok(normalize(text).includes("books(filter:{isPublished:{_eq:$isPublished}}) { title }"));
});

test("selectionSet COUNT aggregate with over and noSelection", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$f`totalBooks ${$a.COUNT(over("books"))}`
		)
	);
	assert.ok(normalize(text).includes("totalBooks: COUNT(books:{})"));
});

test("selectionSet COUNT aggregate with over and varFilters", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$f`publishedBooks ${$a.COUNT(
				over("books"),
				varFilters($p.eq("isPublished","Boolean"))
			)}`
		)
	);
	assert.ok(text.startsWith("query GetUser($isPublished:Boolean) {"));
	assert.ok(normalize(text).includes("publishedBooks: COUNT(books:{filter:{isPublished:{_eq:$isPublished}}})"));
});

test("$f field-level litArgs renders correctly", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$m(
				$f`books ${litArgs($m("limit",10))}`,
				[ "title" ]
			)
		)
	);
	assert.ok(normalize(text).includes("books(limit:10) { title }"));
});

test("$f field-level varArgs hoists var def", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$m(
				$f`books ${varArgs($v("limit","Int"))}`,
				[ "title" ]
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($limit:Int) {"));
	assert.ok(normalize(text).includes("books(limit:$limit) { title }"));
});

test("selectionSet legacy string-key sub-selection", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			{ books: [ "title", "author" ] }
		)
	);
	assert.ok(normalize(text).includes("books { title author }"));
});

test("$f field-level litFilters renders correctly", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$m(
				$f`books ${
					litFilters($p.lit.eq("isPublished",true))
				}`,
				[ "title" ]
			)
		)
	);
	assert.ok(normalize(text).includes("books(filter:{isPublished:{_eq:true}}) { title }"));
});

test("variable deduplication across operation and field level", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters($p.eq("createdAt","sinceDate","DateTime")),
		selectionSet(
			$m(
				$f`books ${
					varFilters($p.eq("publishedAt","sinceDate","DateTime"))
				}`,
				[ "title" ]
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($sinceDate:DateTime) {"));
	assert.ok(normalize(text).includes("books(filter:{publishedAt:{_eq:$sinceDate}}) { title }"));
});

test("subscription() presets kind:subscription", () => {
	var { kind, text } = subscription({
		collectionName: "User",
	});
	assert.equal(kind, "subscription");
	assert.ok(text.startsWith("subscription User"));
});

test("raw() with kind:subscription translates collectionName units", () => {
	var { kind, text } = raw({
		kind: "subscription",
		collectionName: "User",
	});
	assert.equal(kind, "subscription");
	assert.ok(text.startsWith("subscription User"));
});

test("actionPrefix unit applies prefix to root field", () => {
	var { text, resName, } = mutation(
		{ collectionName: "User", },
		actionPrefix("add_")
	);
	assert.equal(resName, "add_User");
	assert.ok(normalize(text).startsWith("mutation User { add_User {"));
});

test("actionPrefix unit with namePrefix applies both", () => {
	var { text, resName, } = mutation(
		{
			collectionName: "User",
			namePrefix: "Dev_",
		},
		actionPrefix("add_")
	);
	assert.equal(resName, "add_User");
	assert.ok(text.includes("add_User: add_Dev_User"));
});


// ************************
// $a — aggregates in selectionSet
// ************************

test("$a.COUNT bare in selectionSet (no alias, no over)", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet($a.COUNT())
	);
	assert.ok(normalize(text).includes("{ COUNT }"));
});

test("$a.COUNT bare in selectionSet with over", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet($a.COUNT(over("books")))
	);
	assert.ok(normalize(text).includes("COUNT(books:{})"));
});

test("$a.COUNT with over and varFilters", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$a.COUNT(
				over("books"),
				varFilters($p.eq("isPublished","Boolean"))
			)
		)
	);
	assert.ok(text.startsWith("query GetUser($isPublished:Boolean) {"));
	assert.ok(normalize(text).includes("COUNT(books:{filter:{isPublished:{_eq:$isPublished}}})"));
});

test("$a.COUNT with over and litFilters", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$a.COUNT(
				over("books"),
				litFilters($p.lit.eq("isPublished",true))
			)
		)
	);
	assert.ok(normalize(text).includes("COUNT(books:{filter:{isPublished:{_eq:true}}})"));
});

test("$a.SUM with over and litArgs field", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$a.SUM(
				over("books"),
				litArgs($m("field","rating"))
			)
		)
	);
	assert.ok(normalize(text).includes(`SUM(books:{field:"rating"})`));
});

test("$f wraps $a.COUNT to provide alias", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$f`publishedBooks ${$a.COUNT(
				over("books"),
				varFilters($p.eq("isPublished","Boolean"))
			)}`
		)
	);
	assert.ok(text.startsWith("query GetUser($isPublished:Boolean) {"));
	assert.ok(normalize(text).includes("publishedBooks: COUNT(books:{filter:{isPublished:{_eq:$isPublished}}})"));
});

test("$f wraps $a.SUM to provide alias", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$f`totalRating ${$a.SUM(
				over("books"),
				litArgs($m("field","rating"))
			)}`
		)
	);
	assert.ok(normalize(text).includes(`totalRating: SUM(books:{field:"rating"})`));
});

test("multiple $a.* items in one selectionSet", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			"username",
			$f`publishedBooks ${$a.COUNT(
				over("books"),
				varFilters($p.eq("isPublished","Boolean"))
			)}`,
			$f`totalRating ${$a.SUM(
				over("books"),
				litArgs($m("field","rating"))
			)}`
		)
	);
	assert.ok(text.startsWith("query GetUser($isPublished:Boolean) {"));
	var n = normalize(text);
	assert.ok(n.includes("username"));
	assert.ok(n.includes("publishedBooks: COUNT(books:{filter:{isPublished:{_eq:$isPublished}}})"));
	assert.ok(n.includes(`totalRating: SUM(books:{field:"rating"})`));
});

test("$a.COUNT variable deduplication across multiple aggregates", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$f`recentBooks ${$a.COUNT(
				over("books"),
				varFilters($p.gt("publishedAt","sinceDate","DateTime"))
			)}`,
			$f`recentArticles ${$a.COUNT(
				over("articles"),
				varFilters($p.gt("publishedAt","sinceDate","DateTime"))
			)}`
		)
	);
	assert.ok(text.startsWith("query GetUser($sinceDate:DateTime) {"));
});


// ************************
// groupBy and GROUP
// ************************

test("groupBy renders bare token field names (not quoted)", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		groupBy("Age"),
		selectionSet("Age")
	);
	assert.ok(text.includes("User(groupBy:[Age])"));
	assert.ok(!text.includes('"Age"'));
});

test("groupBy multiple fields renders array of bare tokens", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		groupBy("Age","Country"),
		selectionSet("Age","Country")
	);
	assert.ok(text.includes("User(groupBy:[Age,Country])"));
});

test("groupBy with empty array renders groupBy:[]", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		groupBy(),
		selectionSet("_docID")
	);
	assert.ok(text.includes("User(groupBy:[])"));
});

test("GROUP renders field as bare token", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$a.MAX(GROUP("Age"))
		)
	);
	assert.ok(normalize(text).includes("MAX(GROUP:{field:Age})"));
	assert.ok(!normalize(text).includes('"Age"'));
});

test("GROUP with varFilters hoists var def", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$f`maxAge ${$a.MAX(GROUP("Age",varFilters($p.gt("Age","Int"))))}`
		)
	);
	assert.ok(text.startsWith("query GetUser($Age:Int) {"));
	assert.ok(normalize(text).includes("maxAge: MAX(GROUP:{field:Age,filter:{Age:{_gt:$Age}}})"));
});

test("GROUP with litFilters renders filter inline", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		selectionSet(
			$a.MAX(GROUP("Age",litFilters($p.lit.gt("Age",26))))
		)
	);
	assert.ok(normalize(text).includes("MAX(GROUP:{field:Age,filter:{Age:{_gt:26}}})"));
});

test("groupBy and GROUP together — full grouped aggregate query", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		groupBy("Age"),
		selectionSet(
			"Age",
			$f`maxAge ${$a.MAX(GROUP("Age"))}`,
			$m("GROUP",["firstName"])
		)
	);
	assert.ok(normalize(text).includes("User(groupBy:[Age])"));
	assert.ok(normalize(text).includes("maxAge: MAX(GROUP:{field:Age})"));
	assert.ok(normalize(text).includes("GROUP { firstName }"));
});


// ************************
// $f — function-call mode (parity with tag form)
// ************************

test("$f() parity: alias + $a token with GROUP", () => {
	var tagQuery = query(
		operationName("Get"),
		root("User"),
		selectionSet($f`maxAge ${$a.MAX(GROUP("Age",varFilters($p.gt("Age","Int"))))}`)
	);
	var fnQuery = query(
		operationName("Get"),
		root("User"),
		selectionSet($f("maxAge",$a.MAX(GROUP("Age",varFilters($p.gt("Age","Int"))))))
	);
	assert.equal(fnQuery.text, tagQuery.text);
});

test("NON_PREFIXED_TYPES collection name skips prefix", () => {
	var { text, } = raw({
		collectionName: "_commits",
		namePrefix: "Dev_",
		operationName: "Get",
	});
	assert.ok(text.includes("_commits"));
	assert.ok(!text.includes("Dev__commits"));
});

test("invalid GQL name for root over throws", () => {
	assert.throws(() => query(
		operationName(null),
		root("COUNT","myCount","bad-name")
	));
});

test("$t token accepted as type in $p.eq", () => {
	var { text, } = query(
		operationName("Get"),
		root("User"),
		varFilters($p.eq("username",$t.String))
	);
	assert.ok(text.includes("$username:String"));
});

// ************************
// root() — over-form alias semantics
// ************************

test("root over-form with null alias renders without alias", () => {
	var { text, resName, } = query(
		{ namePrefix: "Dev_", },
		operationName(null),
		root("COUNT",null,"User"),
		selectionSet(null)
	);
	assert.equal(resName, "COUNT");
	assert.ok(text.includes("COUNT(Dev_User:{})"));
	assert.ok(!text.includes("COUNT:"));
});

test("root over-form with empty-string alias renders without alias", () => {
	var { text, resName, } = query(
		{ namePrefix: "Dev_", },
		operationName(null),
		root("COUNT","","User"),
		selectionSet(null)
	);
	assert.equal(resName, "COUNT");
	assert.ok(text.includes("COUNT(Dev_User:{})"));
	assert.ok(!text.includes("COUNT:"));
});

test("root over-form with undefined alias renders without alias", () => {
	var { text, resName, } = query(
		{ namePrefix: "Dev_", },
		operationName(null),
		root("COUNT",undefined,"User"),
		selectionSet(null)
	);
	assert.equal(resName, "COUNT");
	assert.ok(text.includes("COUNT(Dev_User:{})"));
	assert.ok(!text.includes("COUNT:"));
});

test("root over-form with alias equal to field elides redundant alias", () => {
	var { text, resName, } = query(
		{ namePrefix: "Dev_", },
		operationName(null),
		root("COUNT","COUNT","User"),
		selectionSet(null)
	);
	assert.equal(resName, "COUNT");
	assert.ok(text.includes("COUNT(Dev_User:{})"));
	assert.ok(!text.includes("COUNT: COUNT"));
});

test("root 2-arg form is symmetric with composer's root(field, alias)", () => {
	var { text, resName, } = query(
		operationName(null),
		root("user","currentUser"),
		selectionSet("_docID")
	);
	assert.equal(resName, "currentUser");
	assert.ok(normalize(text).includes("currentUser: user { _docID }"));
});

test("root over-form throws on non-string alias", () => {
	assert.throws(() => query(
		operationName(null),
		root("COUNT",42,"User")
	));
});
