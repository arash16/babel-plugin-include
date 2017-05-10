const { relative, resolve, dirname } = require('path');
const { existsSync, readFileSync } = require('fs');
const generate = require('babel-generator').default;


function moduleFileExists(file) {
	if (!file.endsWith('.js')) file += '.js';
	return existsSync(file);
}

var providers = [
	function localFileProvider(baseDir, moduleId) {
		var file = resolve(baseDir, moduleId);
	    if (!moduleFileExists(file) && moduleFileExists(file + '/index'))
	        file += '/index';

	    if (!file.endsWith('.js')) file += '.js';
	    if (existsSync(file))
	    	return {
	    		id: relative('./', file),
	    		adr: file
	    	};
    }
];

function readModuleFile(file) {
    return readFileSync(file, 'utf8').toString();
}

export default function ({ File, types: t, traverse }) {
	function parse(code, srcFile) {
		const file = new File({
			sourceType: "module",
			filename: srcFile
		});
		return file.wrap(code, function() {
			file.addCode(code);
			file.parseCode(code);
			return file.ast;
		});
	}
	
	
	let loadedModules = Object.create(null);
    function loadModule(baseDir, moduleId) {
    	var file;
        for (var i=0; !file && i<providers.length; ++i)
        	file = providers[i](baseDir, moduleId);

		if (file) {
		    if (loadedModules[file.adr])
		        return loadedModules[file.adr];

	        try {
	        	//console.log("Importing: " + file.adr);
	            var source = readModuleFile(file.adr),
	                ast = parse(source, file.id);
	        }
	        catch (e) {
	            console.error("Error on Parsing Module: " + file.id, e.stack);
	            throw e;
	        }

	        return loadedModules[file.adr] = {
	            file: file.id,
	            folder: dirname(file.adr),
	            source: source,
	            ast: ast
	        }
        }

        console.error('Module ' + moduleId + ' not found.');
        return {};
    }

	function getAllSources(ast) {
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


	return {
		manipulateOptions(opts, parserOpts, file) {
			parserOpts.allowImportExportEverywhere = true;
			parserOpts.allowReturnOutsideFunction = true;
			if (parserOpts.sourceFileName && !parserOpts.sourceFilename)
				parserOpts.sourceFilename = parserOpts.sourceFileName;


			let gen = (opts.generatorOpts = opts.generatorOpts || {}).generator || generate;
			opts.generatorOpts.generator = function(ast, opts, code) {
				let sources = {},
					neededSources = getAllSources(ast),
					loadedFiles = Object.keys(loadedModules);


				getAllSources(ast).forEach(mod => sources[mod] = true);
				if (sources[ast.loc.filename])
					sources[ast.loc.filename] = code;

				for (let fl in loadedModules) {
					let mod = loadedModules[fl];
					if (sources[mod.file])
						sources[mod.file] = mod.source;
				}

				return generate(ast.program, opts, sources);
			}
			
			// parserOpts.parser = function() 
		},
		visitor: {
			ImportDeclaration: function(path) {
				const { node } = path;
				if (!node.specifiers.length) {
					let curDir = dirname(resolve(node.loc.filename || path.hub.file.opts.filename));
					let moduleData = loadModule(curDir, node.source.value);
					if (moduleData.ast)
						path.replaceWith(moduleData.ast);
					// else path.remove();
				}
			}
		}
	};
};
