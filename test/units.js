import assert from "node:assert";
import { module } from "./runner.js";
import { createDefraDBComposer, } from "@gql-x/plugin-defradb";

export const test = module("directives");

var { $p, $a, $m, } = createDefraDBComposer();


// ************************
// $p — compose
// ************************

test("$p merges multiple units", () => {
	assert.deepEqual(
		$p(
			$p.eq("foo","String"),
			$p.eq("bar","Int")
		),
		{ foo: { _eq: "String" }, bar: { _eq: "Int" } }
	);
});

test("$p ignores null units", () => {
	assert.deepEqual(
		$p(
			$p.eq("foo","String"),
			null,
			$p.eq("bar","Int")
		),
		{ foo: { _eq: "String" }, bar: { _eq: "Int" } }
	);
});

test("$p scoped compose nests units under field", () => {
	assert.deepEqual(
		$p("user",
			$p.eq("foo","String"),
			$p.eq("bar","Int")
		),
		{ user: { foo: { _eq: "String" }, bar: { _eq: "Int" } } }
	);
});


// ************************
// $p — operators
// ************************

test("$p.eq 1-arg form", () => {
	assert.deepEqual(
		$p.eq("String"),
		{ _eq: "String" }
	);
});

test("$p.eq 2-arg form", () => {
	assert.deepEqual(
		$p.eq("foo","String"),
		{ foo: { _eq: "String" } }
	);
});

test("$p.eq 3-arg form", () => {
	assert.deepEqual(
		$p.eq("foo","myFoo","String"),
		{ foo: { _eq: { myFoo: "String" } } }
	);
});

test("$p.gt 2-arg form", () => {
	assert.deepEqual(
		$p.gt("createdAt","DateTime"),
		{ createdAt: { _gt: "DateTime" } }
	);
});

test("$p._ prefix preserved", () => {
	assert.deepEqual(
		$p._eq("foo","String"),
		{ foo: { _eq: "String" } }
	);
});

test("$p.in 2-arg form", () => {
	assert.deepEqual(
		$p.in("tags","[String]"),
		{ tags: { _in: "[String]" } }
	);
});

test("$p.neq 2-arg form", () => {
	assert.deepEqual(
		$p.neq("verified","DateTime"),
		{ verified: { _neq: "DateTime" } }
	);
});


// ************************
// $p — and/or/not
// ************************

test("$p.or wraps units in array", () => {
	assert.deepEqual(
		$p.or(
			$p.eq("foo","String"),
			$p.eq("bar","String")
		),
		{ _or: [
			{ foo: { _eq: "String" } },
			{ bar: { _eq: "String" } },
		] }
	);
});

test("$p.and wraps units in array", () => {
	assert.deepEqual(
		$p.and(
			$p.eq("foo","String"),
			$p.eq("bar","String")
		),
		{ _and: [
			{ foo: { _eq: "String" } },
			{ bar: { _eq: "String" } },
		] }
	);
});

test("$p.not merges units into object", () => {
	assert.deepEqual(
		$p.not(
			$p.eq("foo","String"),
			$p.eq("bar","Boolean")
		),
		{ _not: { foo: { _eq: "String" }, bar: { _eq: "Boolean" } } }
	);
});

test("$p.or ignores null entries", () => {
	assert.deepEqual(
		$p.or(
			$p.eq("foo","String"),
			null,
			$p.eq("bar","String")
		),
		{ _or: [
			{ foo: { _eq: "String" } },
			{ bar: { _eq: "String" } },
		] }
	);
});


// ************************
// $p — lit
// ************************

test("$p.lit.eq with boolean value", () => {
	assert.deepEqual(
		$p.lit.eq("isEnabled",true),
		{ isEnabled: { _eq: true } }
	);
});

test("$p.lit.eq with string value", () => {
	assert.deepEqual(
		$p.lit.eq("status","active"),
		{ status: { _eq: "active" } }
	);
});

test("$p.lit.gt with number value", () => {
	assert.deepEqual(
		$p.lit.gt("rating",42),
		{ rating: { _gt: 42 } }
	);
});

test("$p.lit.eq with null value", () => {
	assert.deepEqual(
		$p.lit.eq("deletedAt",null),
		{ deletedAt: { _eq: null } }
	);
});


// ************************
// $p — from
// ************************

test("$p.any.is with 1-arg operator-shaped unit passes through", () => {
	assert.deepEqual(
		$p.any.is($p.in("[String]")),
		{ _any: { _in: "[String]" } }
	);
});

test("$p.any.is with 2-arg field-centered unit inverts", () => {
	assert.deepEqual(
		$p.any.is($p.in("myTags","[String]")),
		{ _any: { _in: { myTags: "[String]" } } }
	);
});

test("$p.all.are with 1-arg operator-shaped unit passes through", () => {
	assert.deepEqual(
		$p.all.are($p.in("[String]")),
		{ _all: { _in: "[String]" } }
	);
});

test("$p.all.are with 2-arg field-centered unit inverts", () => {
	assert.deepEqual(
		$p.all.are($p.in("myTags","[String]")),
		{ _all: { _in: { myTags: "[String]" } } }
	);
});

test("$p.any.is with multi-key filter object passes through", () => {
	assert.deepEqual(
		$p.any.is(
			$p(
				$p.eq("email","String"),
				$p.gt("verified","DateTime")
			)
		),
		{ _any: { email: { _eq: "String" }, verified: { _gt: "DateTime" } } }
	);
});

test("$p.any.is with single-key relation filter passes through", () => {
	assert.deepEqual(
		$p.any.is($p.gt("verified","sinceDate","DateTime")),
		{ _any: { verified: { _gt: { sinceDate: "DateTime" } } } }
	);
});

test("$p.all.are with multi-key filter object passes through", () => {
	assert.deepEqual(
		$p.all.are(
			$p(
				$p.eq("email","String"),
				$p.gt("verified","DateTime")
			)
		),
		{ _all: { email: { _eq: "String" }, verified: { _gt: "DateTime" } } }
	);
});

test("$p.all.are with single-key relation filter passes through", () => {
	assert.deepEqual(
		$p.all.are($p.gt("verified","sinceDate","DateTime")),
		{ _all: { verified: { _gt: { sinceDate: "DateTime" } } } }
	);
});

test("$p scoped compose with any.is", () => {
	assert.deepEqual(
		$p("tags",
			$p.any.is($p.in("[String]"))
		),
		{ tags: { _any: { _in: "[String]" } } }
	);
});

test("$p scoped compose with all.are", () => {
	assert.deepEqual(
		$p("tags",
			$p.all.are($p.in("[String]"))
		),
		{ tags: { _all: { _in: "[String]" } } }
	);
});

test("$p scoped compose with field-centered any.is", () => {
	assert.deepEqual(
		$p("tags",
			$p.any.is($p.in("myTags","[String]"))
		),
		{ tags: { _any: { _in: { myTags: "[String]" } } } }
	);
});

test("$p scoped compose with field-centered all.are", () => {
	assert.deepEqual(
		$p("tags",
			$p.all.are($p.in("myTags","[String]"))
		),
		{ tags: { _all: { _in: { myTags: "[String]" } } } }
	);
});

test("$p.any.is with 3-arg form passes through without inversion", () => {
	assert.deepEqual(
		$p.any.is($p.in("myTags","tagVar","[String]")),
		{ _any: { myTags: { _in: { tagVar: "[String]" } } } }
	);
});

test("$p.all.are with 3-arg form passes through without inversion", () => {
	assert.deepEqual(
		$p.all.are($p.in("myTags","tagVar","[String]")),
		{ _all: { myTags: { _in: { tagVar: "[String]" } } } }
	);
});

test("$p.any.is with scoped multi-condition passes through without inversion", () => {
	assert.deepEqual(
		$p.any.is(
			$p("emails",
				$p.eq("email","String"),
				$p.gt("verified","DateTime")
			)
		),
		{ _any: { emails: { email: { _eq: "String" }, verified: { _gt: "DateTime" } } } }
	);
});

test("$p.all.are with scoped multi-condition passes through without inversion", () => {
	assert.deepEqual(
		$p.all.are(
			$p("emails",
				$p.eq("email","String"),
				$p.gt("verified","DateTime")
			)
		),
		{ _all: { emails: { email: { _eq: "String" }, verified: { _gt: "DateTime" } } } }
	);
});

test("$p.any merges units into object", () => {
	assert.deepEqual(
		$p.any(
			$p.eq("email","String"),
			$p.gt("verified","DateTime")
		),
		{ _any: { email: { _eq: "String" }, verified: { _gt: "DateTime" } } }
	);
});

test("$p.all merges units into object", () => {
	assert.deepEqual(
		$p.all(
			$p.eq("email","String"),
			$p.gt("verified","DateTime")
		),
		{ _all: { email: { _eq: "String" }, verified: { _gt: "DateTime" } } }
	);
});


// ************************
// $p — errors
// ************************

test("$p() throws on non-object unit", () => {
	assert.throws(() => $p("foo","bar","baz","extra"));
});

test("$p.eq() throws with no args", () => {
	assert.throws(() => $p.eq());
});

test("$p.lit.eq() throws without field name", () => {
	assert.throws(() => $p.lit.eq(42, true));
});

test("$p.lit.eq() throws with wrong arg count", () => {
	assert.throws(() => $p.lit.eq("foo"));
});

test("$p.and() throws on non-object unit", () => {
	assert.throws(() => $p.and("notAUnit"));
});

test("$p.or() throws on non-object unit", () => {
	assert.throws(() => $p.or("notAUnit"));
});

test("$p.any.is() throws on non-object unit", () => {
	assert.throws(() => $p.any.is("notAUnit"));
});

test("$p.all.are() throws on non-object unit", () => {
	assert.throws(() => $p.all.are("notAUnit"));
});

test("$p.any.is() throws when inner operator doesn't start with _", () => {
	assert.throws(() => $p.any.is({ field: { notAnOp: "String" } }));
});

test("$p.all.are() throws when inner operator doesn't start with _", () => {
	assert.throws(() => $p.all.are({ field: { notAnOp: "String" } }));
});

test("$p.any.is() throws on field-centered non-object leaf", () => {
	assert.throws(() => $p.any.is({ field: "String" }));
});

test("$p invalid GQL operator name returns undefined", () => {
	assert.equal($p["123foo"], undefined);
	assert.equal($p["_123foo"], undefined);
	assert.equal($p["bad-name"], undefined);
});

test("$p.lit invalid GQL operator name returns undefined", () => {
	assert.equal($p.lit["123foo"], undefined);
	assert.equal($p.lit["_123foo"], undefined);
	assert.equal($p.lit["bad-name"], undefined);
});


// ************************
// $a
// ************************

test("$a.COUNT() returns a $f-style token", () => {
	var tok = $a.COUNT();
	assert.equal(typeof tok, "function");
});

test("$a.COUNT() with no args has field=COUNT, no over", () => {
	var tok = $a.COUNT();
	// coerce to symbol to register meta
	var sym = tok[Symbol.toPrimitive]("default");
	assert.equal(typeof sym, "symbol");
	assert.equal(sym.description, "COUNT");
});

test("$a.COUNT works as $m key", () => {
	var unit = $m($a.COUNT($m("over","books")), null);
	var keys = Object.getOwnPropertySymbols(unit);
	assert.equal(keys.length, 1);
	assert.equal(keys[0].description, "COUNT");
});

test("$a.invalid-name returns undefined", () => {
	assert.equal($a["bad-name"], undefined);
	assert.equal($a["123abc"], undefined);
	assert.equal($a[""], undefined);
});

test("$a reserved names return undefined", () => {
	assert.equal($a.then, undefined);
	assert.equal($a.toString, undefined);
	assert.equal($a.constructor, undefined);
});

test("$a.COUNT() called as tagged template throws", () => {
	var tok = $a.COUNT();
	assert.throws(() => tok`extra`);
});

test("$a.COUNT() with invalid combinator throws", () => {
	assert.throws(() => $a.COUNT("notAUnit"));
});

test("$a.COUNT() with invalid over throws", () => {
	assert.throws(() => $a.COUNT(over("not a valid name")));
});
