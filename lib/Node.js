var path = require("path"),
	htmlParser = require("./parsers/html-parser"),
	jsParser = require("./parsers/js-parser"),
	MetaData = require("./MetaData");

var cwd = process.cwd();

var Node = function (file, unparsed) {
	this.file = file;
	this.path = path.relative(cwd, file.path);
	this.metadata = new MetaData(this.path);

	this.contents = file.contents.toString();

	if (!unparsed) {
		this.parse();
	}
};

Node.prototype.parse = function () {
	var file = this.file,
		result;

	switch (path.extname(file.path)) {
	case ".ejs":
	case ".htm":
	case ".html":
		result = htmlParser(this.contents, this.metadata);
		break;
	case ".js":
		result = jsParser(this.contents, this.metadata);
		break;
	default:
		return;
	}

	this.metadata.parsed = true;
};

module.exports = Node;