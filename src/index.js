import generate from 'babel-generator';
import { relative, resolve, dirname } from 'path';
import { Repository } from './repository';
import { arrUnique } from './util';


export default function ({ File, types: t, traverse, version: bversion }) {
	function parse(code, srcFile) {
		let opts = {
			sourceType: "module",
			filename: srcFile,
			parserOpts: {
				allowImportExportEverywhere: true,
				allowReturnOutsideFunction: true
			}
		};
		const file = new File(parseInt(bversion) == 6 ? opts : { options: opts, passes: [] });
		return file.wrap(code, function() {
			file.addCode(code);
			file.parseCode(code);
			return file.ast;
		});
	}

	function getRequiredSources(ast) {
		let files = {};
		traverse(ast, {
			enter: function (path) {
				let node = path.node;
				if (node && node.loc && node.loc.filename)
					files[node.loc.filename] = 1;
			}
		});

		return Object.keys(files);
	}

	let loader = new Repository({ parse, traverse });
	return {
		pre: function (file) {
			let mainFile = file.opts.filename || file.parserOpts.sourceFileName,
				mainModu = loader.loadModulesRecursive({
					adr: resolve(mainFile),
					file: mainFile,
					ast: file.ast,
					source: file.hub.file.code
				});

			// BFS visit module importees
			let Q = [], bSeen = [];
			bSeen[mainModu.id] = true;
			for (let imee of mainModu.importees) {
				let mod = imee.module;
				if (!bSeen[mod.id]) {
					bSeen[mod.id] = true;
					Q.push(mod);
				}
			}

			while (Q.length) {
				let mod = Q.shift();

				let moduleImportPaths = loader.findRequiredPaths(mod);
				let lcaMod = loader.lcaModules(arrUnique(moduleImportPaths.map(x => x.module)));
				let requiredPaths = arrUnique(moduleImportPaths.filter(x => x.module == lcaMod).map(x => x.path));


				let pos = requiredPaths[0].getEarliestCommonAncestorFrom(requiredPaths).getStatementParent();
				let relfile = relative(dirname(lcaMod.adr), mod.adr);
				if (relfile[0]!='.') relfile = './' + relfile;
				let vast = t.importDeclaration([], t.stringLiteral( relfile ));
				vast.loc = { filename: pos.node.loc.filename };
				pos.insertBefore(vast);

				for (let imee of mod.importees)
					if (!bSeen[imee.module.id]) {
						bSeen[imee.module.id] = true;
						Q.push(imee.module);
					}
			}

			this.modulesPlaced = [];
		},
		manipulateOptions(opts, parserOpts, file) {
			parserOpts.allowImportExportEverywhere = true;
			parserOpts.allowReturnOutsideFunction = true;
			if (parserOpts.sourceFileName && !parserOpts.sourceFilename)
				parserOpts.sourceFilename = parserOpts.sourceFileName;


			let gen = (opts.generatorOpts = opts.generatorOpts || {}).generator || generate;
			opts.generatorOpts.generator = function (ast, opts, code) {
				let sources = {},
					loadedFiles = Object.keys(loader.loadedModules);

				getRequiredSources(ast).forEach(mod => sources[mod] = true);
				if (ast.program && sources[ast.loc.filename])
					sources[ast.loc.filename] = code;

				for (let fl in loader.loadedModules) {
					let mod = loader.loadedModules[fl];
					if (sources[mod.file])
						sources[mod.file] = mod.source;
				}

				for (let reqSrc in sources)
					if (sources[reqSrc] === true)
						throw new Error('Required source "' + reqSrc + '" not found.');

				return generate(ast.program || ast, opts, sources);
			}
		},
		visitor: {
			ImportDeclaration: function(path) {
				const { node } = path;
				if (!node.specifiers.length) {
					let curFile = node.loc.filename || path.hub.file.opts.filename,
						moduleData = loader.loadModule(node.source.value, dirname(resolve(curFile)));

					if (moduleData) {
						if (this.modulesPlaced[moduleData.id] || !moduleData.depth)
							path.remove();
						else {
							this.modulesPlaced[moduleData.id] = true;
							path.replaceWith(moduleData.ast);
						}
					}
				}
			}
		}
	};
};
