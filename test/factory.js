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
	var db = createDefraDBComposer();
	assert.ok(!!db,"has api");
	assert.equal(typeof db.query,"function","has query()");
	assert.equal(typeof db.prefix,"function","has prefix()");
});

test("registerPlugin() returns { api, internals }", () => {
	var reg = registerPlugin();
	assert.ok(!!reg.api,"has api");
	assert.ok(!!reg.internals,"has internals");
	assert.ok(!!reg.internals.composer,"has composer internals");
});

test("createDefraDBComposer() with no config", () => {
	var db = createDefraDBComposer();
	var { text, } = db.query({
		root: { field: "User", },
		operationName: null,
		selectionSet: [ "_docID", ],
	});
	assert.equal(normalize(text),"query { User { _docID } }");
});


// ************************
// api surface
// ************************

test("api exposes composer helpers", () => {
	var db = createDefraDBComposer();
	assert.equal(typeof db.$f,"function","$f");
	assert.equal(typeof db.$t,"object","$t");
	assert.equal(typeof db.$v,"function","$v");
	assert.equal(typeof db.$m,"function","$m");
	assert.equal(typeof db.varArgs,"function","varArgs");
	assert.equal(typeof db.litArgs,"function","litArgs");
	assert.equal(typeof db.varDefs,"function","varDefs");
	assert.equal(typeof db.selectionSet,"function","selectionSet");
	assert.equal(typeof db.root,"function","root");
});

test("api exposes defradb-specific helpers", () => {
	var db = createDefraDBComposer();
	assert.equal(typeof db.$a,"object","$a");
	assert.equal(typeof db.$p,"function","$p");
	assert.equal(typeof db.GROUP,"function","GROUP");
	assert.equal(typeof db.groupBy,"function","groupBy");
	assert.equal(typeof db.over,"function","over");
	assert.equal(typeof db.varFilters,"function","varFilters");
	assert.equal(typeof db.litFilters,"function","litFilters");
	assert.equal(typeof db.varInputs,"function","varInputs");
	assert.equal(typeof db.litInputs,"function","litInputs");
});

test("api exposes collection()", () => {
	var db = createDefraDBComposer();
	assert.equal(typeof db.collection,"function","collection");
});


// ************************
// NAME_PREFIX
// ************************

test("NAME_PREFIX defaults to empty string", () => {
	var db = createDefraDBComposer();
	var { text, } = db.query({
		root: { field: "User", },
		operationName: null,
		selectionSet: [ "_docID", ],
	});
	assert.equal(normalize(text),"query { User { _docID } }");
});

test("NAME_PREFIX applied to queries", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var { text, } = db.query({
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
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var { text, } = db.query(
		{ operationName: "Get", },
		db.root("User"),
		db.varDefs(db.$v("sinceDate","DateTime"))
	);
	assert.ok(text.includes("$sinceDate:DateTime"));
	assert.ok(!text.includes("Dev_DateTime"));
});

test("JSON not prefixed in varDefs", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var { text, } = db.query(
		{ operationName: "Get", },
		db.root("User"),
		db.varDefs(db.$v("payload","JSON"))
	);
	assert.ok(text.includes("$payload:JSON"));
	assert.ok(!text.includes("Dev_JSON"));
});

test("_commits collection name not prefixed", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var { text, } = db.query({
		collectionName: "_commits",
		operationName: "Get",
	});
	assert.ok(text.includes("_commits"));
	assert.ok(!text.includes("Dev__commits"));
});

test("Ordering not prefixed", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var { text, } = db.query(
		{ operationName: "Get", },
		db.root("User"),
		db.varDefs(db.$v("order","Ordering"))
	);
	assert.ok(text.includes("$order:Ordering"));
	assert.ok(!text.includes("Dev_Ordering"));
});

test("caller-supplied nonPrefixedTypes merge with defradb extras", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var { text, } = db.query({
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
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var other = db.prefix("v2_");
	assert.equal(typeof other.query,"function","has query");
	assert.equal(typeof other.collection,"function","has collection");
	assert.equal(typeof other.$a,"object","has $a");
	assert.equal(typeof other.$p,"function","has $p");
	assert.equal(typeof other.varFilters,"function","has varFilters");
});

test("prefix() applies new prefix to queries", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var other = db.prefix("v2_");
	var { text, } = other.query({
		root: { field: "User", },
		operationName: null,
		selectionSet: [ "_docID", ],
	});
	assert.equal(normalize(text),"query { User: v2_User { _docID } }");
});

test("prefix() does not mutate the original api's prefix", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	db.prefix("v2_");
	var { text, } = db.query({
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
	var db = createDefraDBComposer();
	assert.equal(db.exec,undefined,"no exec");
});

test("api with transport has transport methods", () => {
	var transport = {
		exec() { return null; },
		hasActiveTransaction() { return false; },
	};
	var { api: db, } = registerPlugin({ transport, });
	assert.equal(typeof db.exec,"function","has exec");
	assert.equal(typeof db.hasActiveTransaction,"function","has hasActiveTransaction");
});

test("transport methods callable through api", () => {
	var transport = {
		exec({ text, } = {}) {
			return { __mock: true, text, };
		},
	};
	var { api: db, } = registerPlugin({ transport, });
	var result = db.exec({ text: "query Foo { x }", });
	assert.equal(result.__mock,true);
	assert.equal(result.text,"query Foo { x }");
});

test("prefix() preserves transport methods", () => {
	var transport = {
		exec() { return null; },
		hasActiveTransaction() { return false; },
	};
	var { api: db, } = registerPlugin({ transport, });
	var other = db.prefix("v2_");
	assert.equal(typeof other.exec,"function","has exec");
	assert.equal(typeof other.hasActiveTransaction,"function","has hasActiveTransaction");
});


// ************************
// per-instance isolation
// ************************

test("two createDefraDBComposer() instances produce independent apis", () => {
	var a = createDefraDBComposer({ NAME_PREFIX: "A_", });
	var b = createDefraDBComposer({ NAME_PREFIX: "B_", });

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
// internals
// ************************

test("internals.composer exposes makeFieldToken etc", () => {
	var { internals, } = registerPlugin();
	assert.equal(typeof internals.composer.makeFieldToken,"function","makeFieldToken");
	assert.equal(typeof internals.composer.is$fToken,"function","is$fToken");
	assert.equal(typeof internals.composer.get$fSymbol,"function","get$fSymbol");
	assert.ok(!!internals.composer.$fMeta,"$fMeta");
});
