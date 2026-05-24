import assert from "node:assert";
import { module } from "./runner.js";
import { createDefraDBComposer, registerPlugin, } from "@gql-x/plugin-defradb";

export const test = module("collection");

function normalize(str) {
	return str.replace(/\s+/g, " ").trim();
}


// ************************
// collection() shape
// ************************

test("collection() returns an api object", () => {
	var DQL = createDefraDBComposer();
	var users = DQL.collection("User");
	assert.ok(!!users,"has api");
	assert.equal(typeof users.get,"function","has get()");
	assert.equal(typeof users.add,"function","has add()");
	assert.equal(typeof users.update,"function","has update()");
	assert.equal(typeof users.delete,"function","has delete()");
});

test("collection() throws on invalid name", () => {
	var DQL = createDefraDBComposer();
	assert.throws(() => DQL.collection(""));
	assert.throws(() => DQL.collection(null));
	assert.throws(() => DQL.collection(123));
	assert.throws(() => DQL.collection({}));
});


// ************************
// get()
// ************************

test("get() produces query shape", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { text, opName, resName, kind, } = DQL.collection("User").get(
		DQL.selectionSet([ "_docID", "username", ])
	);
	assert.equal(kind,"query");
	assert.equal(opName,"GetUser");
	assert.equal(resName,"User");
	assert.ok(text.startsWith("query GetUser"));
	assert.ok(normalize(text).includes("User: Dev_User { _docID username }"));
});

test("get() with varFilters hoists var defs", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { text, } = DQL.collection("User").get(
		DQL.varFilters(DQL.$p.eq("username","String")),
		DQL.selectionSet([ "_docID", ])
	);
	assert.ok(text.startsWith("query GetUser($username:String) {"));
	assert.ok(text.includes("Dev_User(filter:{username:{_eq:$username}})"));
});

test("get() with no namePrefix has no alias", () => {
	var DQL = createDefraDBComposer();
	var { text, resName, } = DQL.collection("User").get(
		DQL.selectionSet([ "_docID", ])
	);
	assert.equal(resName,"User");
	assert.ok(normalize(text).includes("User { _docID }"));
	assert.ok(!normalize(text).includes("User: User"));
});


// ************************
// add()
// ************************

test("add() produces mutation shape", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { text, opName, resName, kind, } = DQL.collection("User").add(
		DQL.varInputs(DQL.$v("username","String")),
		DQL.selectionSet([ "_docID", ])
	);
	assert.equal(kind,"mutation");
	assert.equal(opName,"AddUser");
	assert.equal(resName,"add_User");
	assert.ok(text.startsWith("mutation AddUser($username:String)"));
	assert.ok(text.includes("add_User: add_Dev_User(input:{username:$username})"));
});

test("add() kind cannot be overridden by chunk", () => {
	var DQL = createDefraDBComposer();
	var { kind } = DQL.collection("User").add({ kind: "query" });
	assert.equal(kind, "mutation");
});


// ************************
// update()
// ************************

test("update() produces mutation shape with update_ action", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { text, opName, kind, } = DQL.collection("User").update(
		DQL.varInputs(DQL.$v("username","String")),
		DQL.selectionSet([ "_docID", ])
	);
	assert.equal(kind,"mutation");
	assert.equal(opName,"UpdateUser");
	assert.ok(text.startsWith("mutation UpdateUser($username:String)"));
	assert.ok(text.includes("update_User: update_Dev_User(input:{username:$username})"));
});


// ************************
// delete()
// ************************

test("delete() produces mutation shape with delete_ action", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { text, opName, kind, } = DQL.collection("User").delete(
		DQL.varFilters(DQL.$p.eq("_docID","ID")),
		DQL.selectionSet([ "_docID", ])
	);
	assert.equal(kind,"mutation");
	assert.equal(opName,"DeleteUser");
	assert.ok(text.startsWith("mutation DeleteUser($_docID:ID)"));
	assert.ok(text.includes("delete_User: delete_Dev_User(filter:{_docID:{_eq:$_docID}})"));
});


// ************************
// aggregate proxy
// ************************

test("aggregate proxy: COUNT() produces query shape", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { text, opName, resName, kind, } = DQL.collection("User").COUNT();
	assert.equal(kind,"query");
	assert.equal(opName,"CountUser");
	assert.equal(resName,"COUNT");
	assert.ok(text.startsWith("query CountUser"));
	assert.ok(text.includes("COUNT(Dev_User:{})"));
});

test("aggregate proxy: SUM() produces query shape", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { text, opName, resName, } = DQL.collection("User").SUM(
		DQL.litArgs(DQL.$m("field","age"))
	);
	assert.equal(opName,"SumUser");
	assert.equal(resName,"SUM");
	assert.ok(text.includes(`SUM(Dev_User:{field:"age"})`));
});

test("aggregate proxy: MAX() with varFilters", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var { text, } = DQL.collection("User").MAX(
		DQL.litArgs(DQL.$m("field","age")),
		DQL.varFilters(DQL.$p.eq("isActive","Boolean"))
	);
	assert.ok(normalize(text).startsWith("query MaxUser($isActive:Boolean) { MAX(Dev_User:{"));
	assert.ok(text.includes(`field:"age"`));
	assert.ok(text.includes("filter:{isActive:{_eq:$isActive}}"));
});

test("aggregate proxy: invalid GQL name returns undefined", () => {
	var DQL = createDefraDBComposer();
	var users = DQL.collection("User");
	assert.equal(users["123abc"],undefined);
	assert.equal(users["bad-name"],undefined);
	assert.equal(users[""],undefined);
});

test("aggregate proxy: symbol key returns undefined", () => {
	var DQL = createDefraDBComposer();
	var users = DQL.collection("User");
	assert.equal(users[Symbol.iterator],undefined);
});


// ************************
// .exec() decoration
// ************************

test("query has no .exec() when no transport", () => {
	var DQL = createDefraDBComposer();
	var q = DQL.collection("User").get(
		DQL.selectionSet([ "_docID", ])
	);
	assert.equal(q.exec,undefined,"no exec");
});

test("query has .exec() when transport present", () => {
	var transport = {
		exec() { return Promise.resolve({}); },
	};
	var { api: DQL, } = registerPlugin({ transport, });
	var q = DQL.collection("User").get(
		DQL.selectionSet([ "_docID", ])
	);
	assert.equal(typeof q.exec,"function","has exec");
});

test("query.exec() calls transport.exec() with the query", async () => {
	var capturedArg = null;
	var capturedVars = null;
	var transport = {
		exec(q,vars) {
			capturedArg = q;
			capturedVars = vars;
			return Promise.resolve({ User: { _docID: "abc123", }, });
		},
	};
	var { api: DQL, } = registerPlugin({ transport, });
	var q = DQL.collection("User").get(
		DQL.selectionSet([ "_docID", ])
	);
	var result = await q.exec({ foo: "bar", });
	assert.equal(capturedArg,q,"transport.exec received the query object");
	assert.deepEqual(capturedVars,{ foo: "bar", },"transport.exec received the vars");
	assert.deepEqual(result,{ _docID: "abc123", },"exec returned result[resName]");
});

test("aggregate proxy query has .exec() when transport present", () => {
	var transport = {
		exec() { return Promise.resolve({}); },
	};
	var { api: DQL, } = registerPlugin({ transport, });
	var q = DQL.collection("User").COUNT();
	assert.equal(typeof q.exec,"function","has exec");
});

test("aggregate proxy query.exec() returns result[resName]", async () => {
	var transport = {
		exec() {
			return Promise.resolve({ COUNT: 42, });
		},
	};
	var { api: DQL, } = registerPlugin({ transport, });
	var q = DQL.collection("User").COUNT();
	var result = await q.exec();
	assert.equal(result,42,"exec returned result.COUNT");
});


// ************************
// prefix chain with collection
// ************************

test("prefix() returns api with working collection()", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var v2 = DQL.prefix("v2_");
	var { text, } = v2.collection("User").get(
		DQL.selectionSet([ "_docID", ])
	);
	assert.ok(normalize(text).includes("User: v2_User { _docID }"));
});

test("aggregate proxy works through prefix() chain", () => {
	var DQL = createDefraDBComposer({ namePrefix: "Dev_", });
	var v2 = DQL.prefix("v2_");
	var { text, resName, } = v2.collection("User").COUNT();
	assert.equal(resName,"COUNT");
	assert.ok(text.includes("COUNT(v2_User:{})"));
});


// ************************
// .map() / .tap() chaining
// ************************

test("collection query has .map() and .tap()", () => {
	var DQL = createDefraDBComposer();
	var q = DQL.collection("User").get(
		DQL.selectionSet([ "_docID", ])
	);
	assert.equal(typeof q.map,"function","has map");
	assert.equal(typeof q.tap,"function","has tap");
});

test("collection query .tap() preserves .exec()", () => {
	var transport = {
		exec() { return Promise.resolve({}); },
	};
	var { api: DQL, } = registerPlugin({ transport, });
	var q = DQL.collection("User").get(
		DQL.selectionSet([ "_docID", ])
	).tap(() => {});
	assert.equal(typeof q.exec,"function","tap preserves exec");
});
