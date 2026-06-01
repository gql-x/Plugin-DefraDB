import assert from "node:assert";
import { module } from "./runner.js";
import { createDefraDBComposer, registerPlugin, } from "@gql-x/plugin-defradb";

export const test = module("factory");

function normalize(str) {
	return str.replace(/\s+/g, " ").trim();
}


// ************************
// createDefraDBComposer / registerPlugin shape
// ************************

test("createDefraDBComposer() returns just the api", () => {
	var DQL = createDefraDBComposer();
	assert.ok(!!DQL,"has api");
});

test("registerPlugin() returns { api, _internals }", () => {
	var reg = registerPlugin();
	assert.ok(!!reg.api,"has api");
	assert.ok(!!reg._internals,"has _internals");
	assert.ok(!!reg._internals.composer,"has composer _internals");
});

test("createDefraDBComposer() with no config", () => {
	var DQL = createDefraDBComposer();
	var { text, } = DQL.query({
		root: { field: "User", },
		operationName: null,
		selectionSet: [ "_docID", ],
	});
	assert.equal(normalize(text),"query { User { _docID } }");
});


// ************************
// api surface
// ************************

test("api exposes builder entry points", () => {
	var DQL = createDefraDBComposer();
	assert.equal(typeof DQL.raw,"function","raw");
	assert.equal(typeof DQL.query,"function","query");
	assert.equal(typeof DQL.mutation,"function","mutation");
	assert.equal(typeof DQL.subscription,"function","subscription");
});

test("api exposes composer helpers", () => {
	var DQL = createDefraDBComposer();
	assert.equal(typeof DQL.$f,"function","$f");
	assert.equal(typeof DQL.$t,"object","$t");
	assert.equal(typeof DQL.$v,"function","$v");
	assert.equal(typeof DQL.$m,"function","$m");
	assert.equal(typeof DQL.varArgs,"function","varArgs");
	assert.equal(typeof DQL.litArgs,"function","litArgs");
	assert.equal(typeof DQL.varDefs,"function","varDefs");
	assert.equal(typeof DQL.selectionSet,"function","selectionSet");
	assert.equal(typeof DQL.root,"function","root");
	assert.equal(typeof DQL.operationName,"function","operationName");
});

test("api exposes defradb-specific helpers", () => {
	var DQL = createDefraDBComposer();
	assert.equal(typeof DQL.$a,"object","$a");
	assert.equal(typeof DQL.$p,"function","$p");
	assert.equal(typeof DQL.GROUP,"function","GROUP");
	assert.equal(typeof DQL.groupBy,"function","groupBy");
	assert.equal(typeof DQL.over,"function","over");
	assert.equal(typeof DQL.varFilters,"function","varFilters");
	assert.equal(typeof DQL.litFilters,"function","litFilters");
	assert.equal(typeof DQL.varInputs,"function","varInputs");
	assert.equal(typeof DQL.litInputs,"function","litInputs");
});

test("api exposes prefix() + collection()", () => {
	var DQL = createDefraDBComposer();
	assert.equal(typeof DQL.prefix,"function","prefix");
	assert.equal(typeof DQL.collection,"function","collection");
});


// ************************
// other inherited builders
// ************************

test("mutation() presets kind:mutation with prefix", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { kind, text } = DQL.mutation({
		root: { field: "User" },
		operationName: null,
		selectionSet: [ "_docID" ],
	});
	assert.equal(kind, "mutation");
	assert.ok(normalize(text).startsWith("mutation { User: Dev_User"));
});

test("subscription() presets kind:subscription", () => {
	var DQL = createDefraDBComposer();
	var { kind, text } = DQL.subscription({
		root: { field: "User" },
		operationName: null,
		selectionSet: [ "_docID" ],
	});
	assert.equal(kind, "subscription");
	assert.ok(text.startsWith("subscription {"));
});

test("mutation() kind cannot be overridden by unit", () => {
	var DQL = createDefraDBComposer();
	var { kind } = DQL.mutation({
		root: { field: "User" },
		kind: "query",
		selectionSet: [ "_docID" ],
	});
	assert.equal(kind, "mutation");
});


// ************************
// namePrefix
// ************************

test("namePrefix defaults to empty string", () => {
	var DQL = createDefraDBComposer();
	var { text, } = DQL.query({
		root: { field: "User", },
		operationName: null,
		selectionSet: [ "_docID", ],
	});
	assert.equal(normalize(text),"query { User { _docID } }");
});

test("namePrefix applied to queries", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { text, } = DQL.query({
		root: { field: "User", },
		operationName: null,
		selectionSet: [ "_docID", ],
	});
	assert.equal(normalize(text),"query { User: Dev_User { _docID } }");
});


// ************************
// DEFRADB_NON_PREFIXED_EXTRAS
// ************************

test("DateTime not prefixed in varDefs", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { text, } = DQL.query(
		{ operationName: "Get", },
		DQL.root("User"),
		DQL.varDefs(DQL.$v("sinceDate","DateTime"))
	);
	assert.ok(text.includes("$sinceDate:DateTime"));
	assert.ok(!text.includes("Dev_DateTime"));
});

test("JSON not prefixed in varDefs", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { text, } = DQL.query(
		{ operationName: "Get", },
		DQL.root("User"),
		DQL.varDefs(DQL.$v("payload","JSON"))
	);
	assert.ok(text.includes("$payload:JSON"));
	assert.ok(!text.includes("Dev_JSON"));
});

test("_commits collection name not prefixed", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { text, } = DQL.query({
		collectionName: "_commits",
		operationName: "Get",
	});
	assert.ok(text.includes("_commits"));
	assert.ok(!text.includes("Dev__commits"));
});

test("Ordering not prefixed", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { text, } = DQL.query(
		{ operationName: "Get", },
		DQL.root("User"),
		DQL.varDefs(DQL.$v("order","Ordering"))
	);
	assert.ok(text.includes("$order:Ordering"));
	assert.ok(!text.includes("Dev_Ordering"));
});

test("caller-supplied nonPrefixedTypes merge with defradb extras", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { text, } = DQL.query({
		nonPrefixedTypes: [ "CustomType", ],
		root: { field: "User", },
		operationName: "Get",
		varDefs: { foo: "CustomType", bar: "DateTime", },
		selectionSet: [ "_docID", ],
	});
	assert.ok(text.includes("$foo:CustomType"));
	assert.ok(text.includes("$bar:DateTime"));
	assert.ok(!text.includes("Dev_CustomType"));
	assert.ok(!text.includes("Dev_DateTime"));
});


// ************************
// prefix()
// ************************

test("prefix() returns a sibling api with defradb decorations", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var other = DQL.prefix("v2_");
	assert.equal(typeof other.query,"function","has query");
	assert.equal(typeof other.collection,"function","has collection");
	assert.equal(typeof other.$a,"object","has $a");
	assert.equal(typeof other.$p,"function","has $p");
	assert.equal(typeof other.varFilters,"function","has varFilters");
});

test("prefix() applies new prefix to queries", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var other = DQL.prefix("v2_");
	var { text, } = other.query({
		root: { field: "User", },
		operationName: null,
		selectionSet: [ "_docID", ],
	});
	assert.equal(normalize(text),"query { User: v2_User { _docID } }");
});

test("prefix() does not mutate the original api's prefix", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	DQL.prefix("v2_");
	var { text, } = DQL.query({
		root: { field: "User", },
		operationName: null,
		selectionSet: [ "_docID", ],
	});
	assert.equal(normalize(text),"query { User: Dev_User { _docID } }");
});


// ************************
// transport propagation
// ************************

test("api without transport has no exec()", () => {
	var DQL = createDefraDBComposer();
	assert.equal(DQL.exec,undefined,"no exec");
});

test("api with transport has transport methods", () => {
	var transport = {
		exec() { return null; },
		hasActiveTransaction() { return false; },
	};
	var { api: DQL, } = registerPlugin({ transport, });
	assert.equal(typeof DQL.exec,"function","has exec");
	assert.equal(typeof DQL.hasActiveTransaction,"function","has hasActiveTransaction");
});

test("transport methods callable through api", () => {
	var transport = {
		exec({ text, } = {}) {
			return { __mock: true, text, };
		},
	};
	var { api: DQL, } = registerPlugin({ transport, });
	var result = DQL.exec({ text: "query Foo { x }", });
	assert.equal(result.__mock,true);
	assert.equal(result.text,"query Foo { x }");
});

test("prefix() preserves transport methods", () => {
	var transport = {
		exec() { return null; },
		hasActiveTransaction() { return false; },
	};
	var { api: DQL, } = registerPlugin({ transport, });
	var other = DQL.prefix("v2_");
	assert.equal(typeof other.exec,"function","has exec");
	assert.equal(typeof other.hasActiveTransaction,"function","has hasActiveTransaction");
});


// ************************
// per-instance isolation
// ************************

test("two createDefraDBComposer() instances produce independent apis", () => {
	var a = createDefraDBComposer({ namePrefix: "A_", });
	var b = createDefraDBComposer({ namePrefix: "B_", });

	var { text: textA, } = a.query({
		root: { field: "User", },
		operationName: null,
		selectionSet: [ "_docID", ],
	});
	var { text: textB, } = b.query({
		root: { field: "User", },
		operationName: null,
		selectionSet: [ "_docID", ],
	});

	assert.ok(textA.includes("A_User"));
	assert.ok(textB.includes("B_User"));
});

test("$f tokens from one instance not recognized by another", () => {
	var a = createDefraDBComposer();
	var b = createDefraDBComposer();

	var tok = a.$f`foo`;
	assert.throws(() => {
		b.query({
			root: { field: "User", },
			operationName: null,
			selectionSet: [ tok, ],
		});
	},"foreign $f token should not be recognized");
});

test("$a tokens from one instance not recognized by another", () => {
	var a = createDefraDBComposer();
	var b = createDefraDBComposer();

	var tok = a.$a.COUNT();
	assert.throws(() => {
		b.query({
			root: { field: "User", },
			operationName: null,
			selectionSet: [ tok, ],
		});
	},"foreign $a token should not be recognized");
});


// ************************
// _internals
// ************************

test("_internals.composer exposes makeFieldToken etc", () => {
	var { _internals, } = registerPlugin();
	assert.equal(typeof _internals.composer.makeFieldToken,"function","makeFieldToken");
	assert.equal(typeof _internals.composer.is$fToken,"function","is$fToken");
	assert.equal(typeof _internals.composer.get$fSymbol,"function","get$fSymbol");
	assert.ok(!!_internals.composer.$fMeta,"$fMeta");
});
