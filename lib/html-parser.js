var htmlparser = require("htmlparser2"),
	MetaData = require("./MetaData");

module.exports = function (file) {
	var content = file.contents.toString();
	var matches = [];
	var match;

	var elemRegex = /<ng-include.*?src\s*=\s*"\s*'(.*?\.html)'\s*".*?>/g;
	while ((match = elemRegex.exec(content)) !== null) {
		matches.push(match[1]);
	}

	var attrRegex = /<\w+.*?ng-include\s*=\s*"\s*'(.*?\.html)'\s*".*?>/g;
	while ((match = attrRegex.exec(content)) !== null) {
		matches.push(match[1]);
	}

	var out = new MetaData(file);

	var templates = [];
	matches.forEach(function (template) {
		out.addTemplate(template);
	});

	var tokens = [];
	var parser = new htmlparser.Parser({
		onopentag: function (name, attributes) {
			if (!~tokens.indexOf(name)) {
				tokens.push(name);
			}
			Object.keys(attributes).forEach(function (attribute) {
				if (attribute == "ng-controller") {
					var controller = attributes[attribute];
					out.addDependency(controller);
				} else if (!~tokens.indexOf(attribute)) {
					tokens.push(attribute);
				}
			});
		}
	});
	parser.write(content);
	parser.done();

	tokens.forEach(function (token) {
		token = token.replace(/-([a-z])/g, function (m) {
			return m[1].toUpperCase();
		});
		out.addToken(token);
	});

	return out;
};