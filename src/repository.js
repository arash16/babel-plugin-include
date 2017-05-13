import { findModule } from "./provider";
import { resolve, dirname } from 'path';
import { readFileSync } from 'fs';
import { arrUnique } from './util';



class ModuleImportPath {
	constructor(module, path) {
		this.module = module;
		this.path = path;
	}
};


export class Repository {
	constructor({ parse, traverse }) {
		this.parse = parse;
		this.traverse = traverse;

		this.loadedModules = Object.create(null);
		this.modules = [];
	}

	addModule(filename, adr, source, ast) {
		if (this.loadedModules[adr])
			return this.loadedModules[adr];

		if (ast === undefined) {
		    try {
				ast = this.parse(source, filename);
		    }
		    catch (e) {
		        console.error("Error on Parsing Module: " + filename, e.stack);
		        throw e;
		    }
		}

		let modData = {
        	id: this.modules.length,
        	adr: adr,
            ast: ast,
            file: filename,
            source: source,
            importees: [],
            importers: [],
            depth: Infinity
        };

		this.modules.push(modData);
		return this.loadedModules[adr] = modData;
	}

	loadModule(moduleId, baseDir) {
    	let file = findModule(moduleId, baseDir);
    	if (!file) return;

	    if (this.loadedModules[file.adr])
	        return this.loadedModules[file.adr];

		return this.addModule(
			file.id,
			file.adr,
			readFileSync(file.adr, 'utf8').toString()
		);
    }

    loadModulesRecursive(mod, baseDir) {
    	let root = typeof mod=='string' ?
    		this.loadModule(mod, baseDir) :
    		this.addModule(mod.file, mod.adr, mod.source, mod.ast);
    	root.depth = 0;

    	let that = this;
		let lmSeen = [];
		(function loadRecursive(moduleData) {
			lmSeen[moduleData.id] = true;

			let curDir = dirname(resolve(moduleData.file));
			that.traverse(moduleData.ast, {
				ImportDeclaration: function(path) {
					const { node } = path;
					if (!node.specifiers.length) {
						let chldMod = that.loadModule(node.source.value, curDir);
						if (chldMod) {
							chldMod.depth = Math.min(chldMod.depth, moduleData.depth + 1);
							chldMod.importers.push(new ModuleImportPath(moduleData, path));
							moduleData.importees.push(new ModuleImportPath(chldMod, path));
							if (!lmSeen[chldMod.id])
								loadRecursive(chldMod);
						}
					}
				}
			});
		})(root);
		return root;
    }

	findRequiredPaths(mod1) {
		let frpSeen = [];
		return arrUnique(function rec1(mod) {
			let result = [];
			if (frpSeen[mod.id])
				return result;
			frpSeen[mod.id] = true;

			for (let imer of mod.importers) {
				if (imer.module != mod1)
					result.push(imer);

				if (imer.module.depth > 0)
					[].push.apply(result, rec1(imer.module));
			}
			return result;
		}(mod1));
	}

	ascendents(mod) {
		let result = [];
		(function rec2(mod) {
			result[mod.id] = 1;
			for (let imer of mod.importers)
				if (!result[imer.module.id])
					rec2(imer.module);
		})(mod);
		return result;
	}

	lcaModules(mods) {
		let that = this;
		let intersect = this.ascendents(mods[0]);
		mods.forEach((mod, i) => {
			if (!i) return;

			let aa = that.ascendents(mod);
			for (let i in intersect)
				if (!aa[i])
					delete intersect[i];
		});

		// common ancestors
		let coma = [];
		for (let i in intersect)
			coma.push(this.modules[i]);

		// sort descending on depth
		coma.sort((a, b) => a.depth < b.depth);
		let best = coma[coma.length-1];
		for (let i=0; i<coma.length; ++i)
			if (!coma[i+1] || coma[i+1].depth!=coma[i].depth)
				return coma[i];
	}
};
