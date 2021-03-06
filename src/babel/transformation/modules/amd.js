import DefaultFormatter from "./_default";
import CommonFormatter from "./common";
import includes from "lodash/collection/includes";
import values from "lodash/object/values";
import * as util from  "../../util";
import * as t from "../../types";

export default class AMDFormatter extends DefaultFormatter {
  init() {
    CommonFormatter.prototype._init.call(this, this.hasNonDefaultExports);
  }

  buildDependencyLiterals() {
    var names = [];
    for (var name in this.ids) {
      names.push(t.literal(name));
    }
    return names;
  }

  /**
   * Wrap the entire body in a `define` wrapper.
   */

  transform(program) {
    DefaultFormatter.prototype.transform.apply(this, arguments);

    var body = program.body;

    // build an array of module names

    var names = [t.literal("exports")];
    if (this.passModuleArg) names.push(t.literal("module"));
    names = names.concat(this.buildDependencyLiterals());
    names = t.arrayExpression(names);

    // build up define container

    var params = values(this.ids);
    if (this.passModuleArg) params.unshift(t.identifier("module"));
    params.unshift(t.identifier("exports"));

    var container = t.functionExpression(null, params, t.blockStatement(body));

    var defineArgs = [names, container];
    var moduleName = this.getModuleName();
    if (moduleName) defineArgs.unshift(t.literal(moduleName));

    var call = t.callExpression(t.identifier("define"), defineArgs);

    program.body = [t.expressionStatement(call)];
  }

  /**
   * Get the AMD module name that we'll prepend to the wrapper
   * to define this module
   */

  getModuleName() {
    if (this.file.opts.moduleIds) {
      return DefaultFormatter.prototype.getModuleName.apply(this, arguments);
    } else {
      return null;
    }
  }

  _getExternalReference(node) {
    return this.scope.generateUidIdentifier(node.source.value);
  }

  importDeclaration(node) {
    this.getExternalReference(node);
  }

  importSpecifier(specifier, node, nodes) {
    var key = node.source.value;
    var ref = this.getExternalReference(node);

    if (t.isImportNamespaceSpecifier(specifier) || t.isImportDefaultSpecifier(specifier)) {
      this.defaultIds[key] = specifier.local;
    }

    if (includes(this.file.dynamicImportedNoDefault, node)) {
      // Prevent unnecessary renaming of dynamic imports.
      this.ids[node.source.value] = ref;
    } else if (t.isImportNamespaceSpecifier(specifier)) {
      // import * as bar from "foo";
    } else if (!includes(this.file.dynamicImported, node) && t.isSpecifierDefault(specifier) && !this.noInteropRequireImport) {
      // import foo from "foo";
      var uid = this.scope.generateUidIdentifier(specifier.local.name);
      nodes.push(t.variableDeclaration("var", [
        t.variableDeclarator(uid, t.callExpression(this.file.addHelper("interop-require"), [ref]))
      ]));
      ref = uid;
    } else {
      // import { foo } from "foo";
      var imported = specifier.imported;
      if (t.isSpecifierDefault(specifier)) imported = t.identifier("default");
      ref = t.memberExpression(ref, imported);
    }

    this.internalRemap[specifier.local.name] = ref;
  }

  exportSpecifier(specifier, node, nodes) {
    if (this.doDefaultExportInterop(specifier)) {
      nodes.push(util.template("exports-default-assign", {
        VALUE: specifier.local
      }, true));
    } else {
      CommonFormatter.prototype.exportSpecifier.apply(this, arguments);
    }
  }

  exportDeclaration(node, nodes) {
    if (this.doDefaultExportInterop(node)) {
      this.passModuleArg = true;

      var declar = node.declaration;
      var assign = util.template("exports-default-assign", {
        VALUE: this._pushStatement(declar, nodes)
      }, true);

      if (t.isFunctionDeclaration(declar)) {
        // we can hoist this assignment to the top of the file
        assign._blockHoist = 3;
      }

      nodes.push(assign);
      return;
    }

    DefaultFormatter.prototype.exportDeclaration.apply(this, arguments);
  }
}
