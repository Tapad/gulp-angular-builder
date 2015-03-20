var through = require("through2"),
	gutil = require("gulp-util"),
	Graph = require("./lib/Graph"),
	filters = require("./consts/angular-filters"),
	PluginError = require("./lib/errors").PluginError;

module.exports = function (seeds, options, fullBuild) {
	options = parseOptions(options, fullBuild);
	var graph = new Graph(seeds, options);

	return through.obj(function (file, enc, next) {
		try {
			graph.add(file);
			next();
		} catch (e) {
			this.emit("error", e);
		}
	}, function (next) {
		var stream = this;
		try {
			graph.build().forEach(function (node) {
				stream.push(node.file);
			});

			next();
		} catch (e) {
			this.emit("error", e);
		}
	});
};


module.exports.watch = function (seeds, options) {
	options = parseOptions(options);
	var graph = new Graph(seeds, options);

	out = {};

	out.builder = function () {
		return through.obj(function (file, enc, next) {
			try {
				graph.add(file);
				next();
			} catch (e) {
				this.emit("error", e);
			}
		}, function (next) {
			var stream = this;
			try {
				graph.build().forEach(function (node) {
					stream.push(node.file.clone());
				});

				next();
			} catch (e) {
				this.emit("error", e);
			}
		});
	};

	out.update = function (file) {
		switch (file.event) {
		case "add":
		case "change":
			graph.add(file);
			break;
		case "unlink":
			graph.remove(file);
			break;
		}
	};

	return out;
};

function parseOptions(options, fullBuild) {
	if (!options.appModule) {
		throw new PluginError("Missing options.appModule in configuration.");
	}

	options.parseExclude = parseOption(options.parseExclude);
	options.requiredFiles = parseOption(options.requiredFiles);
	options.requiredLibs = parseOption(options.requiredLibs);
	options.filePriority = parseOption(options.filePriority);
	options.optionalLibs = parseOption(options.optionalLibs);
	options.optionalLibsInclude = parseOption(options.optionalLibsInclude);
	options.globalDependencies = parseOption(options.globalDependencies);
	options.globalModules = parseOption(options.globalModules);

	options.verbose = options.verbose || false;
	options.debug = options.debug || false;

	filters.forEach(function (filter) {
		options.globalDependencies.push("filter:" + filter);
	});

	options.fullBuild = !!fullBuild;
	return options;
}

function parseOption(option) {
	if (option instanceof Array) {
		return option;
	}
	if (option == null) {
		return [];
	}
	return [option];
}