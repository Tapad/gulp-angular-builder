var gutil = require("gulp-util"),
	through = require("through2"),
	path = require("path"),
	esprima = require("esprima"),
	glob = require("glob"),
	chalk = require("chalk"),
	MetaData = require("./lib/MetaData"),
	htmlParser = require("./lib/html-parser.js"),
	jsParser = require("./lib/js-parser.js"),
	angularFilters = require("./consts/angular-filters.json");

var prepareOptions = function (options) {
	// Prepare the options input argument
	if (!options.appModule) {
		throw new gutil.PluginError("gulp-angular-builder", chalk.red("options.appModule") + " is missing!");
	}

	// Check inputs and convert them to arrays if not already
	[
		"parseExclude",
		"requiredFiles",
		"ignoredTemplates",
		"requiredLibs",
		"filePriority",
		"optionalLibs",
		"globalModules",
		"globalDependencies",
		"filesWithResolvedDeps"
	].forEach(function (property) {
		if (!options[property]) {
			options[property] = [];
		} else if (!(options[property] instanceof Array)) {
			options[property] = [options[property]];
		}
	});

	options.optionalLibsInclude = options.optionalLibsInclude || ("includes" + path.sep + "*.js");

	return options;
};

module.exports = function (seeds, options) {
	// Get seed argument
	seeds = (typeof seeds == "string") ? [seeds] : seeds;

	// Check seeds array
	if (!Array.isArray(seeds)) {
		throw new gutil.PluginError("gulp-angular-builder", chalk.red("seeds") + " should be a string or an array.");
	}

	// Get seed paths
	seeds = seeds.map(function (seed) {
		return path.resolve(seed);
	});

	// Get options
	options = prepareOptions(options) || {};


	// Private variables
	var files = {};
	var definitions = {};
	var requiredModules = [];
	var requiredFiles = [];

	// Actions for following tree
	var addRequiredModule = function (module) {
		if (options.appModule == module || !!~options.globalModules.indexOf(module)) {
			// Module is app module or a global module
			return;
		}
		if (!~requiredModules.indexOf(module)) {
			requiredModules.push(module);
		}
	};
	var addRequiredFile = function (file) {
		file = path.normalize(file);
		if (!~requiredFiles.indexOf(file)) {
			requiredFiles.push(file);
			followTree(file);
		}
	};
	var addRequiredLibs = function (file) {
		file = path.normalize(file);
		if (!~requiredFiles.indexOf(file)) {
			requiredFiles.push(file);
		}
	};
	var addRequiredTemplate = function (template) {
		if (hasMatch(template, options.ignoredTemplates)) {
			return;
		}
		addRequiredFile(getTemplatePath(template));
	};
	var addRequiredDependency = function (dependency, seed) {
		if (!!~options.globalDependencies.indexOf(dependency)) {
			return;
		}
		if (!definitions[dependency]) {
			if (hasMatch(seed, options.filesWithResolvedDeps)) {
				gutil.log("Cannot find dependency: " + chalk.yellow(dependency) + " but is in a file with resolved dependencies.");
			} else {
				throw new gutil.PluginError("gulp-angular-builder", "Cannot find dependency " + chalk.red(dependency) + " in file " + chalk.magenta(seed) + ". Is it a global dependency?");
			}
			return;
		}
		addRequiredFile(definitions[dependency].path);
	};
	var addRequiredFilter = function (filter, seed) {
		if (!!~angularFilters.indexOf(filter)) {
			return;
		}
		if (!definitions[filter]) {
			gutil.log("Cannot find defined filter: " + chalk.yellow(filter) + " in file " + chalk.magenta(seed) + ".");
			return;
		}
		addRequiredFile(definitions[filter].path);
	};
	var followTree = function (seed) {
		if (!files[seed]) {
			throw new gutil.PluginError("gulp-angular-builder", "Seed file cannot be found in stream: " + chalk.magenta(seed) + ".");
		}

		// Templates required
		(files[seed].templates || []).forEach(addRequiredTemplate);

		// Modules required
		(files[seed].modules || []).forEach(addRequiredModule);

		// Javascript dependencies
		(files[seed].dependencies || []).forEach(function (dependency) {
			addRequiredDependency(dependency, seed);
		});

		// Filters
		(files[seed].filters || []).forEach(function (filter) {
			addRequiredFilter(filter, seed);
		});

		// Animations
		(files[seed].animations || []).forEach(function (animation) {
			if (!definitions[animation]) {
				return;
			}
			addRequiredFile(definitions[animation].path);
		});

		// HTML tokens (look for directives, if exists)
		(files[seed].tokens || []).forEach(function (token) {
			if (!definitions[token]) {
				return;
			}
			addRequiredFile(definitions[token].path);
		});

		// Check if optional libs
		if (hasMatch(seed, options.optionalLibs)) {
			glob.sync(path.dirname(seed) + path.sep + options.optionalLibsInclude).forEach(addRequiredLibs);
		}
	};


	// Go through each file
	var stream = through.obj(function (file, enc, next) {
		// Check if file is excluded
		if (hasMatch(file.path, options.parseExclude)) {
			files[file.path] = new MetaData(file);
			next();
			return;
		}

		// Get metadata of the file
		try {
			var metadata = files[file.path] = parseFile(file);
			if (metadata.definitions && metadata.definitions.length > 0) {
				metadata.definitions.forEach(function (definition) {
					definitions[definition] = metadata;
				});
			}

			next();
		} catch (e) {
			this.emit("error", e);
		}
	}, function (next) {
		try {
			// Require core library files
			Object.keys(files).forEach(function (file) {
				if (hasMatch(file, options.requiredLibs)) {
					addRequiredLibs(file);
				}
			});

			// Go through each seed file
			seeds.forEach(addRequiredFile);

			// Require core library files
			Object.keys(files).forEach(function (file) {
				if (files[file].config || files[file].run) {
					addRequiredFile(file);
				}
			});

			// Require other required files
			Object.keys(files).forEach(function (file) {
				if (hasMatch(file, options.requiredFiles)) {
					addRequiredFile(file);
				}
			});

			// Sort by file priority order
			if (options.filePriority.length) {
				requiredFiles.sort(function (a, b) {
					var i = options.filePriority.indexOf(path.basename(a));
					var j = options.filePriority.indexOf(path.basename(b));
					if (~i && ~j) {
						return i < j ? -1 : 1;
					}
					if (~i) {
						return -1;
					}
					if (~j) {
						return 1;
					}
					return a < b ? -1 : 1;
				});
			}

			// Add modules item to stream
			this.push(new gutil.File({
				cwd: "",
				base: "",
				path: "init.js",
				contents: new Buffer('angular.module("' + options.appModule + '", ' + JSON.stringify(options.globalModules.concat(requiredModules)) + ');\n\n')
			}));

			// Return all required files in the stream
			requiredFiles.forEach(function (file) {
				file = path.normalize(file);
				if (!files[file] || !files[file].file) {
					throw new gutil.PluginError("gulp-angular-builder", "Required file cannot be found: " + chalk.magenta(file) + ".");
				}
				stream.push(files[file].file);
			});

			next();
		} catch (e) {
			this.emit("error", e);
		}
	});

	return stream;
};

var parseFile = function (file) {
	switch (path.extname(file.path)) {
	case ".ejs":
	case ".html":
		return htmlParser(file);
	case ".js":
		return jsParser(file);
	case ".json":
	default:
		return new MetaData(file);
	}
};

var getTemplatePath = function (template) {
	if (template[0] != ".") {
		if (template[0] == path.sep) {
			template = "." + template;
		} else {
			template = "." + path.sep + template;
		}
	}
	return path.resolve(template);
};

var hasMatch = function (string, checks, notPath) {
	var matched = false;
	if (!notPath) {
		string = path.normalize(string).replace(new RegExp("\\" + path.sep, "g"), "/");
	}
	(checks instanceof Array ? checks : [checks]).forEach(function (check) {
		if (string.match(check)) {
			matched = true;
			return false;
		}
	});
	return matched;
};
