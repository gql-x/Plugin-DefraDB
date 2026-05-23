import assert from "node:assert";
import { module } from "./runner.js";
import { createDefraDBComposer, } from "@gql-x/plugin-defradb";

export const test = module("combinators");

var {
	varInputs,
	varFilters,
	litInputs,
	litFilters,
	groupBy,
	GROUP,
	root,
	over,
	$p,
	$m,
	$v,
} = createDefraDBComposer();


// ************************
// varFilters
// ************************

test("varFilters produces { varFilters: ... }", () => {
	assert.deepEqual(
		varFilters($p.eq("foo","String")),
		{ varFilters: { foo: { _eq: "String" } } }
	);
});

test("varFilters merges multiple chunks", () => {
	assert.deepEqual(
		varFilters(
			$p.eq("foo","String"),
			$p.eq("bar","Int")
		),
		{ varFilters: { foo: { _eq: "String" }, bar: { _eq: "Int" } } }
	);
});


// ************************
// litFilters
// ************************

test("litFilters produces { litFilters: ... }", () => {
	assert.deepEqual(
		litFilters($p.lit.eq("isEnabled",true)),
		{ litFilters: { isEnabled: { _eq: true } } }
	);
});

test("litFilters merges multiple chunks", () => {
	assert.deepEqual(
		litFilters(
			$p.lit.eq("isEnabled",true),
			$p.lit.eq("status","active")
		),
		{ litFilters: { isEnabled: { _eq: true }, status: { _eq: "active" } } }
	);
});


// ************************
// varInputs
// ************************

test("varInputs produces { varInputs: ... }", () => {
	assert.deepEqual(
		varInputs($v("foo","String")),
		{ varInputs: { foo: "String" } }
	);
});

test("varInputs merges multiple chunks", () => {
	assert.deepEqual(
		varInputs(
			$v("foo","String"),
			$v("bar","Int")
		),
		{ varInputs: { foo: "String", bar: "Int" } }
	);
});


// ************************
// litInputs
// ************************

test("litInputs produces { litInputs: ... }", () => {
	assert.deepEqual(
		litInputs($m("foo","hello")),
		{ litInputs: { foo: "hello" } }
	);
});

test("litInputs merges multiple chunks", () => {
	assert.deepEqual(
		litInputs(
			$m("foo","hello"),
			$m("bar",42)
		),
		{ litInputs: { foo: "hello", bar: 42 } }
	);
});


// ************************
// root
// ************************

// test("root 1-arg form", () => {
// 	assert.deepEqual(
// 		root("User"),
// 		{ root: { field: "User" } }
// 	);
// });

// test("root 2-arg form with over", () => {
// 	assert.deepEqual(
// 		root("COUNT","User"),
// 		{ root: { field: "COUNT", over: "User" } }
// 	);
// });

// test("root 3-arg form with alias", () => {
// 	assert.deepEqual(
// 		root("COUNT","User","myCount"),
// 		{ root: { field: "COUNT", over: "User", alias: "myCount" } }
// 	);
// });


// ************************
// over
// ************************

test("over throws with no args", () => {
	assert.throws(() => over());
});

test("over with valid name produces argsWrapper chunk", () => {
	var result = over("User");
	assert.ok(result.argsWrapper && typeof result.argsWrapper.render == "function");
});

test("over throws on non-string arg", () => {
	assert.throws(() => over({ User: 1 }));
});

test("over throws on invalid GQL name", () => {
	assert.throws(() => over("not a valid name"));
	assert.throws(() => over("123abc"));
});


// ************************
// groupBy
// ************************

test("groupBy throws on empty string", () => {
	assert.throws(() => groupBy(""));
});

test("groupBy throws on invalid GQL name", () => {
	assert.throws(() => groupBy("123abc"));
	assert.throws(() => groupBy("not valid"));
});


// ************************
// GROUP
// ************************

test("GROUP throws with no args", () => {
	assert.throws(() => GROUP());
});

test("GROUP throws on empty string", () => {
	assert.throws(() => GROUP(""));
});

test("GROUP throws on invalid GQL name", () => {
	assert.throws(() => GROUP("123abc"));
	assert.throws(() => GROUP("not valid"));
});
