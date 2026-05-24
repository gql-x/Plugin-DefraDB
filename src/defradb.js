import { registerPlugin as dbRegisterPlugin, } from "@gql-x/composer/db";


export { createDefraDBComposer, registerPlugin, };


// *****************************

var DEFRADB_NON_PREFIXED_EXTRAS = [
	"JSON",
	"DateTime",
	"Ordering",
	"Commit",
	"Blob",
	"_commits",
];

var $aReserved = new Set([
	"then",
	"toString",
	"valueOf",
	"inspect",
	"constructor",
	"__proto__",
	"prototype",
	"caller",
	"callee",
	"arguments",
	"render",
]);


// *****************************

function createDefraDBComposer(config = {}) {
	return registerPlugin(config).api;
}

function registerPlugin({
	namePrefix = "",
	transport = null,
	...rest
} = {}) {
	return dbRegisterPlugin({
		namePrefix,
		nonPrefixedTypes: DEFRADB_NON_PREFIXED_EXTRAS,
		transport,
		decorate: decorateDefraDB,
		...rest,
	});
}

function decorateDefraDB(prefixedAPI,composer,composerInternals) {
	// wrap all four DB-layer entry points to translate defradb-level chunks
	// (collectionName, actionPrefix) into composer-level chunks (root,
	// operationName) before the underlying builder sees them.
	for (let entryPoint of [ "raw", "query", "mutation", "subscription", ]) {
		let base = prefixedAPI[entryPoint];
		prefixedAPI[entryPoint] = function wrapped(...args) {
			var translated = translateDefraDBChunks(args);
			return base(...translated);
		};
	}

	return Object.assign(prefixedAPI,{
		// re-expose composer helpers on the API surface
		$f: composer.$f,
		$t: composer.$t,
		$v: composer.$v,
		$m: composer.$m,
		varArgs: composer.varArgs,
		litArgs: composer.litArgs,
		varDefs: composer.varDefs,
		operationName: composer.operationName,
		selectionSet: composer.selectionSet,

		// (but NOT root; defradb provides its own
		// root() with `over` support)
		root: root,

		// add DefraDB-specific helpers (not in composer)
		$a: make$a(composerInternals),
		$p: make$p(composerInternals),
		GROUP: GROUP,
		groupBy: groupBy,
		over: over,
		varFilters: varFilters,
		litFilters: litFilters,
		varInputs: varInputs,
		litInputs: litInputs,
		actionPrefix,

		// add collection() with CRUD + aggregate proxy
		collection: makeCollection(prefixedAPI,prefixedAPI),
	});
}


// *****************************
// DefraDB-specific helpers
// *****************************

function translateDefraDBChunks(args) {
	var collectionName = null;
	var ap = "";

	var out = args.map(chunk => {
		if (
			chunk &&
			typeof chunk == "object" &&
			!Array.isArray(chunk)
		) {
			var modified = chunk;

			if ("collectionName" in modified) {
				let { collectionName: cn, ...rest } = modified;
				collectionName = cn;
				modified = rest;
			}

			if ("actionPrefix" in modified) {
				let { actionPrefix: a, ...rest } = modified;
				ap = a || "";
				modified = rest;
			}

			return modified;
		}
		return chunk;
	});

	// find root.field for fallback concat target
	var rootChunk = out.find(c => c && typeof c == "object" && c.root && typeof c.root == "object");
	var concatTarget = collectionName != null ? collectionName : (rootChunk ? rootChunk.root.field : null);

	if (collectionName != null && !(typeof collectionName == "string" && collectionName != "")) {
		throw new Error("collectionName must be a non-empty string");
	}

	var hasRoot = !!rootChunk;
	var hasOpName = out.some(c => c && typeof c == "object" && "operationName" in c);

	var injected = {};

	if (collectionName != null && !hasRoot) {
		// capture ap in closure — composer never sees actionPrefix
		let capturedAP = ap;
		let capturedCN = collectionName;
		injected.root = {
			field: capturedCN,
			render(rootRenderCtx) {
				var { namePrefix, nonPrefixedTypes, } = rootRenderCtx;
				var rootFieldBase = (
					nonPrefixedTypes.includes(capturedCN) ?
						capturedCN :
						`${namePrefix}${capturedCN}`
				);
				var rootField = `${capturedAP}${rootFieldBase}`;
				var rootAlias = (
					rootField !== `${capturedAP}${capturedCN}` ?
						`${capturedAP}${capturedCN}` :
						null
				);
				if (rootAlias === rootField) rootAlias = null;
				return { rootField, rootAlias, };
			},
		};
	}

	if (concatTarget != null) {
		if (!hasOpName) {
			if (collectionName != null) injected.operationName = collectionName;
		}
		else {
			out = out.map(c => {
				if (c && typeof c == "object" && "operationName" in c) {
					// preserve explicit null/empty — caller wants omit/fallback
					if (c.operationName == null || c.operationName === "") {
						return c;
					}
					return { ...c, operationName: `${c.operationName}${concatTarget}` };
				}
				return c;
			});
		}
	}

	if (Object.keys(injected).length > 0) {
		out.unshift(injected);
	}

	return out;
}


// *****************************
// actionPrefix(): produces { actionPrefix: .. }
// *****************************

function actionPrefix(ap) {
	return { actionPrefix: ap, };
}


// *****************************
// root(): defradb's 3-arg form supports `over`
// *****************************

function root(field,alias,over) {
	if (!(typeof field == "string" && field != "")) {
		throw new Error("root() requires a non-empty field name");
	}

	if (over === undefined) {
		// no `over` — behaves like composer's root(field, alias)
		var r = { field, };
		if (alias !== undefined && alias !== null && alias !== "") {
			r.alias = alias;
		}
		return { root: r, };
	}

	if (alias !== undefined && alias !== null && alias !== "" && typeof alias != "string") {
		throw new Error("root() alias must be a string (or null/undefined for no alias)");
	}

	if (!(typeof over == "string" && over != "")) {
		throw new Error("root() over must be a non-empty string");
	}

	if (!isGQLName(over)) {
		throw new Error("root() over must be a valid GraphQL name");
	}

	return {
		root: {
			field,
			alias: (alias != null && alias !== "" ? alias : null),
			argsWrapper: makeOverWrapperToken(over),
			render(rootRenderCtx) {
				var { namePrefix, nonPrefixedTypes, } = rootRenderCtx;
				var rootField = field;
				var rootAlias = (alias != null && alias !== "" ? alias : null);
				// elide redundant alias
				if (rootAlias === rootField) rootAlias = null;
				return { rootField, rootAlias, };
			},
		},
	};
}


// *****************************
// over(): produces { argsWrapper: <token> }
// *****************************

function over(target) {
	if (!(typeof target == "string" && target != "")) {
		throw new Error("over() requires a non-empty string");
	}
	if (!isGQLName(target)) {
		throw new Error("over() requires a valid GraphQL name");
	}
	return { argsWrapper: makeOverWrapperToken(target), };
}

function makeOverWrapperToken(target) {
	return {
		render(wrapperRenderCtx,innerArgsStr) {
			var normalizedTarget = wrapperRenderCtx.normalizeType(target);
			return `(${normalizedTarget}:{${innerArgsStr}})`;
		},
	};
}


// *****************************
// $p: filter/predicate compose helper
// *****************************

function make$p(composerInternals) {
	var { is$tToken, get$tTokenName, } = composerInternals;

	function unwrapType(v) {
		return is$tToken(v) ? get$tTokenName(v) : v;
	}

	return new Proxy(
		function predicateCompose(...args) {
			if (!(typeof args[0] == "string" && args[0] != "")) {
				return mergeChunks(args,"$p(..) part");
			}

			let [ field, ...parts ] = args;
			return {
				[field]: mergeChunks(parts,`$p(${field},..) part`),
			};
		},
		{
			apply(target,thisArg,args) {
				return target(...args);
			},

			get(target,p,r) {
				if (typeof p == "symbol") return Reflect.get(target,p,r);

				if ([ "and", "or", "not", "any", "all", ].includes(p)) {
					if ([ "not", "any", "all", ].includes(p)) {
						let op = `_${p}`;
						var objectOp = function objectOp(...parts) {
							return {
								[op]: mergeChunks(parts,`$p.${p}(..) part`),
							};
						};

						if ([ "any", "all", ].includes(p)) {
							let fnName = (p == "any" ? "is" : "are");
							objectOp[fnName] = function wrappedPredicateOp(...parts) {
								let chunk = mergeChunks(parts,`$p.${p}.${fnName}(..) part`);
								return {
									[op]: normalizeWrappedPredicateChunk(
										chunk,
										`$p.${p}.${fnName}(..)`
									),
								};
							};
						}

						return objectOp;
					}

					let op = `_${p}`;
					return function logicalOp(...parts) {
						let entries = [];
						for (let part of parts) {
							if (part == null) continue;
							if (!isChunkObject(part)) {
								throw new Error(`$p.${p}(..) only accepts object chunks`);
							}
							entries.push(part);
						}
						return { [op]: entries, };
					};
				}

				if (p == "lit") {
					return new Proxy(Object.create(null),{
						get(tt,pp,rr) {
							if (typeof pp == "symbol") return undefined;
							if (typeof pp != "string" || pp == "") return undefined;

							let opName = pp.startsWith("_") ? pp.slice(1) : pp;
							if (!isGQLName(opName)) return undefined;

							let op = `_${opName}`;

							return function literalPredicateOp(field,value) {
								if (!(typeof field == "string" && field != "")) {
									throw new Error(`$p.lit.${pp}(..) requires a field name`);
								}
								if (arguments.length != 2) {
									throw new Error(`$p.lit.${pp}(..) expects (field,value)`);
								}

								return {
									[field]: {
										[op]: value,
									},
								};
							};
						},
					});
				}

				if (typeof p != "string" || p == "") return undefined;

				let opName = p.startsWith("_") ? p.slice(1) : p;
				if (!isGQLName(opName)) return undefined;

				let op = `_${opName}`;

				let predicateOp = function predicateOp(a,b,c) {
					a = unwrapType(a);
					b = unwrapType(b);
					c = unwrapType(c);

					if (
						typeof a == "string" &&
						a != "" &&
						b === undefined &&
						c === undefined
					) {
						return { [op]: a, };
					}

					if (
						typeof a == "string" &&
						a != "" &&
						typeof b == "string" &&
						b != "" &&
						c === undefined
					) {
						return { [a]: { [op]: b, }, };
					}

					if (
						typeof a == "string" &&
						a != "" &&
						typeof b == "string" &&
						b != "" &&
						typeof c == "string" &&
						c != ""
					) {
						return { [a]: { [op]: { [b]: c, }, }, };
					}

					throw new Error(
						`$p.${p}(..) expects (type), (field,type), or (field,varName,type)`
					);
				};

				return predicateOp;
			},
		}
	);
}


// *****************************
// $a: aggregate function proxy
// *****************************

function make$a(composerInternals) {
	var { makeFieldToken, } = composerInternals;

	return new Proxy(Object.create(null),{
		get(t,p,r) {
			if (typeof p == "symbol") return undefined;
			if ($aReserved.has(p)) return undefined;
			if (!isGQLName(p)) return undefined;

			return function aggregateFn(...combinators) {
				var extra = mergeChunks(combinators,`$a.${p}(..) part`);

				var state = {
					stage: "final",
					pendingName: null,
					alias: null,
					field: p,
					argsWrapper: null,
					varArgs: null,
					litArgs: null,
					sym: null,
				};

				if (extra.argsWrapper != null) {
					if (!(extra.argsWrapper && typeof extra.argsWrapper.render == "function")) {
						throw new Error("argsWrapper must be a render-protocol token");
					}
					state.argsWrapper = extra.argsWrapper;
				}
				if (extra.varArgs != null) {
					state.varArgs = Object.assign(Object.create(null),extra.varArgs);
				}
				if (extra.litArgs != null) {
					state.litArgs = Object.assign(Object.create(null),extra.litArgs);
				}
				if (extra.varFilters != null) {
					if (state.varArgs == null) state.varArgs = Object.create(null);
					state.varArgs.filter = Object.assign(Object.create(null),state.varArgs.filter || null,extra.varFilters);
				}
				if (extra.litFilters != null) {
					if (state.litArgs == null) state.litArgs = Object.create(null);
					state.litArgs.filter = Object.assign(Object.create(null),state.litArgs.filter || null,extra.litFilters);
				}

				return makeFieldToken(state);
			};
		},
	});
}


// *****************************
// GROUP(): render-protocol token for litArgs.GROUP
// *****************************

function GROUP(field,...combinators) {
	if (!(typeof field == "string" && field != "")) {
		throw new Error("GROUP() requires a non-empty string field name");
	}
	if (!isGQLName(field)) {
		throw new Error(`GROUP() invalid GQL name: ${field}`);
	}

	var extra = mergeChunks(combinators,"GROUP(..) part");

	return {
		litArgs: {
			GROUP: makeGroupToken(field,extra),
		},
	};
}

function makeGroupToken(field,extra) {
	return {
		render(renderCtx) {
			var state = {
				field: "GROUP",
				argsWrapper: null,
				varArgs: null,
				litArgs: null,
			};

			if (extra.argsWrapper != null) {
				state.argsWrapper = extra.argsWrapper;
			}
			if (extra.varArgs != null) {
				state.varArgs = Object.assign(Object.create(null),extra.varArgs);
			}
			if (extra.litArgs != null) {
				state.litArgs = Object.assign(Object.create(null),extra.litArgs);
			}
			if (extra.varFilters != null) {
				if (state.varArgs == null) state.varArgs = Object.create(null);
				state.varArgs.filter = Object.assign(Object.create(null),state.varArgs.filter || null,extra.varFilters);
			}
			if (extra.litFilters != null) {
				if (state.litArgs == null) state.litArgs = Object.create(null);
				state.litArgs.filter = Object.assign(Object.create(null),state.litArgs.filter || null,extra.litFilters);
			}

			var { varDefs, argsStr, } = renderCtx.renderFieldMeta(state);
			renderCtx.addVarDefs(varDefs,"GROUP");

			// argsStr is wrapped in parens; strip and re-wrap as object literal
			var innerArgs = argsStr ? argsStr.slice(1,-1) : "";
			var inner = `field:${field}${innerArgs ? `,${innerArgs}` : ""}`;
			return `{${inner}}`;
		},
	};
}


// *****************************
// groupBy(): bare-name tokens
// *****************************

function groupBy(...fields) {
	for (let f of fields) {
		if (!(typeof f == "string" && f != "")) {
			throw new Error("groupBy() requires non-empty string field names");
		}
		if (!isGQLName(f)) {
			throw new Error(`groupBy() invalid GQL name: ${f}`);
		}
	}
	return {
		litArgs: {
			groupBy: fields.map(makeBareNameToken),
		},
	};
}

function makeBareNameToken(name) {
	return {
		render(renderCtx) { return name; },
		toString() { return name; },
	};
}


// *****************************
// filter/input shorthand chunk producers
// *****************************

function varFilters(...chunks) {
	return { varFilters: mergeChunks(chunks,"varFilters(..) part"), };
}

function litFilters(...chunks) {
	return { litFilters: mergeChunks(chunks,"litFilters(..) part"), };
}

function varInputs(...chunks) {
	return { varInputs: mergeChunks(chunks,"varInputs(..) part"), };
}

function litInputs(...chunks) {
	return { litInputs: mergeChunks(chunks,"litInputs(..) part"), };
}


// *****************************
// collection API
// *****************************

function makeCollection(prefixedAPI,defradbAPI) {
	return function collection(collectionName) {
		if (!(collectionName && typeof collectionName == "string")) {
			throw new Error("Invalid collection name");
		}

		var aggregateProxy = new Proxy(Object.create(null),{
			get(t,fnName,r) {
				if (typeof fnName == "symbol") return undefined;
				if (typeof fnName != "string" || fnName == "") return undefined;
				if (!isGQLName(fnName)) return undefined;

				var opName = fnName[0] + fnName.slice(1).toLowerCase();

				return function aggregateCount(...combinators) {
					return buildAggregateQuery(fnName,opName,combinators);
				};
			},
		});

		var collectionAPI = Object.assign(
			Object.create(aggregateProxy),
			{
				get(...args) {
					return buildCollectionQuery({
						entryPoint: "query",
						operationName: "Get",
						actionPrefix: "",
					},args);
				},
				add(...args) {
					return buildCollectionQuery({
						entryPoint: "mutation",
						operationName: "Add",
						actionPrefix: "add_",
					},args);
				},
				update(...args) {
					return buildCollectionQuery({
						entryPoint: "mutation",
						operationName: "Update",
						actionPrefix: "update_",
					},args);
				},
				delete(...args) {
					return buildCollectionQuery({
						entryPoint: "mutation",
						operationName: "Delete",
						actionPrefix: "delete_",
					},args);
				},
			}
		);
		return collectionAPI;


		// ************************

		function buildCollectionQuery({ entryPoint, operationName, actionPrefix, },combinators) {
			var query = prefixedAPI[entryPoint](
				{
					collectionName,
					operationName,
					actionPrefix,
				},
				...combinators
			);
			return decorateExec(query);
		}

		function buildAggregateQuery(fnName,opName,combinators) {
			var query = prefixedAPI.query(
				{
					collectionName,
					operationName: opName,
				},
				defradbAPI.root(fnName,null,collectionName),
				defradbAPI.selectionSet.none(),
				...combinators
			);
			return decorateExec(query);
		}

		function decorateExec(query) {
			if (typeof prefixedAPI.exec == "function") {
				query.exec = function execQuery(vars) {
					return (
						prefixedAPI.exec(query,vars)
							.then(result => result?.[query.resName])
					);
				};
			}
			return query;
		}
	};
}


// *****************************
// stateless helpers
// *****************************

function isGQLName(str) {
	return /^[_A-Za-z][_0-9A-Za-z]*$/.test(str);
}

function isChunkObject(v) {
	return !!(v && typeof v == "object" && !Array.isArray(v));
}

function mergeChunks(parts,label = "chunk") {
	var out = Object.create(null);

	for (let part of parts) {
		if (part == null) continue;
		if (!isChunkObject(part)) {
			throw new Error(`Invalid ${label} (expected non-array object chunk)`);
		}
		Object.assign(out,part);
	}

	return out;
}

function normalizeWrappedPredicateChunk(chunk,sourceLabel) {
	if (!isChunkObject(chunk)) {
		throw new Error(`${sourceLabel} only accepts object chunks`);
	}

	let keys = Object.keys(chunk);

	if (keys.length != 1) {
		return chunk;
	}

	let key = keys[0];
	let val = chunk[key];

	if (key.startsWith("_")) {
		return chunk;
	}

	if (!isChunkObject(val)) {
		throw new Error(`${sourceLabel} expects a field comparator chunk`);
	}

	let innerKeys = Object.keys(val);
	if (innerKeys.length != 1) {
		return chunk;
	}

	let innerOp = innerKeys[0];
	let innerVal = val[innerOp];

	if (!innerOp.startsWith("_")) {
		throw new Error(`${sourceLabel} expects an operator under the wrapped field`);
	}

	if (typeof innerVal == "string") {
		return {
			[innerOp]: { [key]: innerVal, },
		};
	}

	return chunk;
}
