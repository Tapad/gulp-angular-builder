var htmlparser = require("htmlparser2"),
	MetaData = require("../MetaData");

module.exports = function (contents, metadata) {
	metadata = metadata || new MetaData();

	var parsed = parseContent(contents);
	Object.keys(parsed).forEach(function (type) {
		parsed[type].forEach(function (dep) {
			metadata.addDependency(type, dep);
		});
	});

	return metadata;
};

function parseContent(contents) {
	var component = [],
		template = [],
		directiveToken = [],
		animationToken = [],
		filter = [];

	// Get filters
	var interpolationRegex = /\{\{\s*?(.*?)\s*?\}\}/g,
		filterRegex = /(?:^|\()\s*\w+?\s*\|\s*(\w+?)\s*(?:\)|(?=\|)|$)/,
		expression;

	while ((expression = interpolationRegex.exec(contents)) !== null) {
		expression = expression[1];
		while (expression.match(filterRegex) !== null) {
			expression = expression.replace(filterRegex, function (match, f) {
				filter.push(f);
				return "expression";
			});
		}
	}

	// Get everything else
	var parser = new htmlparser.Parser({
		onopentag: function (name, attributes) {
			// Add directive token
			directiveToken.push(name);

			if (name == "ng-include") {
				// Add template
				template.push(attributes["src"]);
			}

			Object.keys(attributes).forEach(function (attr) {
				if (attr == "ng-include") {
					// Add template
					template.push(attributes[attr]);
				} else if (attr == "ng-controller") {
					// Add controller
					component.push(attributes[attr]);
				} else if (attr == "class" || attr == "ng-class") {
					// Add animation tokens (all the class names)
					var classes;
					if (attr == "ng-class") {
						classes = [];
						attributes[attr].split(",").forEach(function (item) {
							classes.push(item.split(":")[0].replace(/[\{\}'"\s]/g, ""));
						});
					} else {
						classes = attributes[attr].split(/\s+/g);
					}
					classes.forEach(function (item) {
						animationToken.push("." + item);
					});
				} else {
					// Add directive tokens
					directiveToken.push(attr);
				}
			});
		}
	});
	parser.write(contents);
	parser.done();

	// ng-include should be strings, pull out the actual paths
	template = template.map(function (template) {
		if (template[0] == "'" || template[0] == '"') {
			return template.substr(1, template.length - 2);
		}
		return null;
	}).filter(function (_) {
		return _;
	});

	return {
		component: component,
		filter: filter,
		template: template,
		directiveToken: directiveToken,
		animationToken: animationToken
	};
}