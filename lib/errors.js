var gutil = require("gulp-util");

module.exports.EsprimaError = function (err, path) {
	return new gutil.PluginError(
		"gulp-angular-builder",
		"Esprima Parsing Error" +
		"\nFile: " + gutil.colors.magenta(path) +
		"\nReason: " + gutil.colors.red(err.description) +
		"\nLine: " + gutil.colors.cyan(err.lineNumber) +
		"\nColumn: " + gutil.colors.cyan(err.column)
	);
};

module.exports.MetaDataError = function (source, type, item, path) {
	return new gutil.PluginError(
		"gulp-angular-builder",
		"Meta Data Error" +
		"\nFile: " + gutil.colors.magenta(path) +
		"\nSource:" + source +
		"\nType:" + type +
		"\nItem:" + item
	);
};

module.exports.GraphError = function (reason, component, path) {
	var file;
	if (path instanceof Array) {
		file = "\n" + path.map(function (path) {
			"File: " + gutil.colors.magenta(path);
		}).join("\n");
	} else {
		file = "\nFile: " + gutil.colors.magenta(path);
	}

	return new gutil.PluginError(
		"gulp-angular-builder",
		"Graph Error" +
		file +
		"\nComponent: " + component +
		"\nReason: " + reason
	);
};