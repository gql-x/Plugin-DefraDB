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
	var db = createDefraDBComposer();
	var users = db.collection("User");
	assert.ok(!!users,"has api");
	assert.equal(typeof users.get,"function","has get()");
	assert.equal(typeof users.add,"function","has add()");
	assert.equal(typeof users.update,"function","has update()");
	assert.equal(typeof users.delete,"function","has delete()");
});

test("collection() throws on invalid name", () => {
	var db = createDefraDBComposer();
	assert.throws(() => db.collection(""));
	assert.throws(() => db.collection(null));
	assert.throws(() => db.collection(123));
	assert.throws(() => db.collection({}));
});


// ************************
// get()
// ************************

test("get() produces query shape", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var { text, operationName, resultName, kind, } = db.collection("User").get(
		db.selectionSet([ "_docID", "username", ])
	);
	assert.equal(kind,"query");
	assert.equal(operationName,"GetUser");
	assert.equal(resultName,"User");
	assert.ok(text.startsWith("query GetUser"));
	assert.ok(normalize(text).includes("User: Dev_User { _docID username }"));
});

test("get() with varFilters hoists var defs", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var { text, } = db.collection("User").get(
		db.varFilters(db.$p.eq("username","String")),
		db.selectionSet([ "_docID", ])
	);
	assert.ok(text.startsWith("query GetUser($username:String) {"));
	assert.ok(text.includes("Dev_User(filter:{username:{_eq:$username}})"));
});

test("get() with no namePrefix has no alias", () => {
	var db = createDefraDBComposer();
	var { text, resultName, } = db.collection("User").get(
		db.selectionSet([ "_docID", ])
	);
	assert.equal(resultName,"User");
	assert.ok(normalize(text).includes("User { _docID }"));
	assert.ok(!normalize(text).includes("User: User"));
});


// ************************
// add()
// ************************

test("add() produces mutation shape", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var { text, operationName, resultName, kind, } = db.collection("User").add(
		db.varInputs(db.$v("username","String")),
		db.selectionSet([ "_docID", ])
	);
	assert.equal(kind,"mutation");
	assert.equal(operationName,"AddUser");
	assert.equal(resultName,"add_User");
	assert.ok(text.startsWith("mutation AddUser($username:String)"));
	assert.ok(text.includes("add_User: add_Dev_User(input:{username:$username})"));
});


// ************************
// update()
// ************************

test("update() produces mutation shape with update_ action", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var { text, operationName, kind, } = db.collection("User").update(
		db.varInputs(db.$v("username","String")),
		db.selectionSet([ "_docID", ])
	);
	assert.equal(kind,"mutation");
	assert.equal(operationName,"UpdateUser");
	assert.ok(text.startsWith("mutation UpdateUser($username:String)"));
	assert.ok(text.includes("update_User: update_Dev_User(input:{username:$username})"));
});


// ************************
// delete()
// ************************

test("delete() produces mutation shape with delete_ action", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var { text, operationName, kind, } = db.collection("User").delete(
		db.varFilters(db.$p.eq("_docID","ID")),
		db.selectionSet([ "_docID", ])
	);
	assert.equal(kind,"mutation");
	assert.equal(operationName,"DeleteUser");
	assert.ok(text.startsWith("mutation DeleteUser($_docID:ID)"));
	assert.ok(text.includes("delete_User: delete_Dev_User(filter:{_docID:{_eq:$_docID}})"));
});


// ************************
// aggregate proxy
// ************************

test("aggregate proxy: COUNT() produces query shape", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var { text, operationName, resultName, kind, } = db.collection("User").COUNT();
	assert.equal(kind,"query");
	assert.equal(operationName,"CountUser");
	assert.equal(resultName,"COUNT");
	assert.ok(text.startsWith("query CountUser"));
	assert.ok(text.includes("COUNT(Dev_User:{})"));
});

test("aggregate proxy: SUM() produces query shape", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var { text, operationName, resultName, } = db.collection("User").SUM(
		db.litArgs(db.$m("field","age"))
	);
	assert.equal(operationName,"SumUser");
	assert.equal(resultName,"SUM");
	assert.ok(text.includes(`SUM(Dev_User:{field:"age"})`));
});

test("aggregate proxy: MAX() with varFilters", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var { text, } = db.collection("User").MAX(
		db.litArgs(db.$m("field","age")),
		db.varFilters(db.$p.eq("isActive","Boolean"))
	);
	assert.ok(normalize(text).startsWith("query MaxUser($isActive:Boolean) { MAX(Dev_User:{"));
	assert.ok(text.includes(`field:"age"`));
	assert.ok(text.includes("filter:{isActive:{_eq:$isActive}}"));
});

test("aggregate proxy: invalid GQL name returns undefined", () => {
	var db = createDefraDBComposer();
	var users = db.collection("User");
	assert.equal(users["123abc"],undefined);
	assert.equal(users["bad-name"],undefined);
	assert.equal(users[""],undefined);
});

test("aggregate proxy: symbol key returns undefined", () => {
	var db = createDefraDBComposer();
	var users = db.collection("User");
	assert.equal(users[Symbol.iterator],undefined);
});


// ************************
// .exec() decoration
// ************************

test("query has no .exec() when no transport", () => {
	var db = createDefraDBComposer();
	var q = db.collection("User").get(
		db.selectionSet([ "_docID", ])
	);
	assert.equal(q.exec,undefined,"no exec");
});

test("query has .exec() when transport present", () => {
	var transport = {
		exec() { return Promise.resolve({}); },
	};
	var { api: db, } = registerPlugin({ transport, });
	var q = db.collection("User").get(
		db.selectionSet([ "_docID", ])
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
	var { api: db, } = registerPlugin({ transport, });
	var q = db.collection("User").get(
		db.selectionSet([ "_docID", ])
	);
	var result = await q.exec({ foo: "bar", });
	assert.equal(capturedArg,q,"transport.exec received the query object");
	assert.deepEqual(capturedVars,{ foo: "bar", },"transport.exec received the vars");
	assert.deepEqual(result,{ _docID: "abc123", },"exec returned result[resultName]");
});

test("aggregate proxy query has .exec() when transport present", () => {
	var transport = {
		exec() { return Promise.resolve({}); },
	};
	var { api: db, } = registerPlugin({ transport, });
	var q = db.collection("User").COUNT();
	assert.equal(typeof q.exec,"function","has exec");
});

test("aggregate proxy query.exec() returns result[resultName]", async () => {
	var transport = {
		exec() {
			return Promise.resolve({ COUNT: 42, });
		},
	};
	var { api: db, } = registerPlugin({ transport, });
	var q = db.collection("User").COUNT();
	var result = await q.exec();
	assert.equal(result,42,"exec returned result.COUNT");
});


// ************************
// prefix chain with collection
// ************************

test("prefix() returns api with working collection()", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var v2 = db.prefix("v2_");
	var { text, } = v2.collection("User").get(
		db.selectionSet([ "_docID", ])
	);
	assert.ok(normalize(text).includes("User: v2_User { _docID }"));
});

test("aggregate proxy works through prefix() chain", () => {
	var db = createDefraDBComposer({ NAME_PREFIX: "Dev_", });
	var v2 = db.prefix("v2_");
	var { text, resultName, } = v2.collection("User").COUNT();
	assert.equal(resultName,"COUNT");
	assert.ok(text.includes("COUNT(v2_User:{})"));
});


// ************************
// .map() / .tap() chaining
// ************************

test("collection query has .map() and .tap()", () => {
	var db = createDefraDBComposer();
	var q = db.collection("User").get(
		db.selectionSet([ "_docID", ])
	);
	assert.equal(typeof q.map,"function","has map");
	assert.equal(typeof q.tap,"function","has tap");
});

test("collection query .tap() preserves .exec()", () => {
	var transport = {
		exec() { return Promise.resolve({}); },
	};
	var { api: db, } = registerPlugin({ transport, });
	var q = db.collection("User").get(
		db.selectionSet([ "_docID", ])
	).tap(() => {});
	assert.equal(typeof q.exec,"function","tap preserves exec");
});
