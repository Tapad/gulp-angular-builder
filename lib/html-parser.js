var htmlparser = require("htmlparser2"),
	MetaData = require("./MetaData");

module.exports = function (file) {
	var content = file.contents.toString();
	var templates = [];
	var match;

	var elemRegex = /<ng-include.*?src\s*=\s*"\s*'(.*?\.html)'\s*".*?>/g;
	while ((match = elemRegex.exec(content)) !== null) {
		templates.push(match[1]);
	}

	var attrRegex = /<\w+.*?ng-include\s*=\s*"\s*'(.*?\.html)'\s*".*?>/g;
	while ((match = attrRegex.exec(content)) !== null) {
		templates.push(match[1]);
	}

	var filters = [];
	var interpolationRegex = /\{\{\s*(.*?)\s*\}\}/g;
	var filterRegex = /\|(?!\|)\s*([^\:]*?)\s*(?:\:|$)/m;
	while ((match = interpolationRegex.exec(content)) !== null) {
		match = match[1].replace(/\|{2,}/, "").match(filterRegex);
		if (match) {
			filters.push(match[1]);
		}
	}

	var out = new MetaData(file);
	templates.forEach(function (template) {
		out.addTemplate(template);
	});
	filters.forEach(function (filter) {
		out.addFilter(filter);
	});

	var tokens = [];
	var animations = [];
	var parser = new htmlparser.Parser({
		onopentag: function (name, attributes) {
			if (!~tokens.indexOf(name)) {
				tokens.push(name);
			}
			Object.keys(attributes).forEach(function (attribute) {
				if (attribute == "ng-controller") {
					var controller = attributes[attribute];
					out.addDependency(controller);
				} else if (attribute == "class" || attribute == "ng-class") {
					// Get animations
					var classes;
					if (attribute == "ng-class") {
						classes = [];
						attributes[attribute].split(",").forEach(function (item) {
							classes.push(item.split(":")[0].replace(/[\{\}'"\s]/g, ""));
						});
					} else {
						classes = attributes[attribute].split(/\s+/g);
					}
					classes.forEach(function (item) {
						animations.push("." + item);
					});
				} else if (attribute == "id") {
					animations.push("#" + attributes[attribute]);
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
	animations.forEach(function (animation) {
		out.addAnimation(animation);
	});

	return out;
};