/* global require __dirname */
const babel = require('@babel/core');
const Terser = require('terser');
const { default: babelPluginIstanbul } = require('babel-plugin-istanbul');
const { readFileSync, writeFileSync } = require('fs');
const vm = require('vm');

/**
 * Here, we open up the code that we want to trim down and instrument it
 * with Istanbul.  In short, this adds a bunch of incrementers so that
 * we can get an idea of what parts of the code were touched.
 *
 * You can see the output in `instrumented.js` after running this file
 * using `npm run`;
 */
const filename = `${__dirname}/node_modules/ember-source/dist/ember-template-compiler.js`;
const templateCompilerCode = readFileSync(filename);

writeFileSync('original.js', templateCompilerCode);

const instrumentedTemplateCompiler = babel.transform(templateCompilerCode, {
  filename: 'ember-template-compiler.js',
  plugins: [
    [ babelPluginIstanbul, {} ]
  ]
}).code;

writeFileSync('instrumented.js', instrumentedTemplateCompiler);

/**
 * In order for us to test the coverage, the code has to be executed in the ways
 * that we expect.
 *
 * Below is some code that tests the behavior of the Ember template compiler that
 * we expect to work after the code has been trimmed.  The template markup
 * represents a component invocation.  The trimmed code may not work for other
 * template features because the paths that support them will have been removed.
 */
const test = `
  module.exports.precompile('{{#component "test-component" someProperty=this.attrs.someProperty}}{{this.blockContent}}{{/component}}');
`;

/**
 * Run the instrumented code and return the coverage report.
 * The dummy module object is just there to allow us to
 * call the `precompile()` function that's exported.
 */
const [ coverageForFiles, precompile ] = (() => {
  const script = new vm.Script(instrumentedTemplateCompiler)

  const context = new vm.createContext({
    module: {
      exports: {},
      // eslint-disable-next-line no-undef
      require
    }
  });

  script.runInNewContext(context);

  return [ context.__coverage__, context.module.exports.precompile ]
})();

/**
 * Save the output of the `precompile()` function for validation later.
 */
const beforeTestOutput = precompile(test);

function isSameFunction(nodeA, nodeB) {
  return nodeA &&
         nodeA.loc &&
         nodeB &&
         nodeB.name &&
         nodeA.loc.start.line === nodeB.loc.start.line &&
         ((nodeA.id && nodeA.id.name === nodeB.name) || (nodeA.loc.end.line === nodeB.loc.end.line));
}

function isSameStatement(locA, locB) {
  return locA &&
         locB &&
         locA.start.line === locB.start.line &&
         locA.end.line === locB.end.line &&
         locA.start.column === locB.start.column;
}

/**
 * This is a Babel plugin that iterates through the AST of the
 * code and uses the coverage report to determine whether
 * functions and statements are "dead" and should be removed.
 *
 * You can see that we check whether the location of the
 * statement/declaration has been called zero-times.
 */
function removeUnusedCode ({ types: t }) {
	return {
    name: 'remove-unused-code',
		visitor: {
      FunctionDeclaration(path) {
        const coverage = coverageForFiles[this.filename];
        if (!coverage) return;
        for (const fnNum in coverage.fnMap) {
          const fn = coverage.fnMap[fnNum];
          if (!isSameFunction(path.node, fn)) continue;
          const isDeadCode = coverage.f[fnNum] === 0;
          if (!isDeadCode) continue;
          /**
           * Some functions are accessed or are expected to have a prototype,
           * even if they don't end up getting called.  Because of that, we'll
           * replace the functions with empty functions.
           */
          const noop = t.functionDeclaration(path.node.id, [], t.blockStatement([]));
          path.replaceWith(noop);
          return;
        }
      },
      FunctionExpression(path) {
        if (path.node.id && path.parent.type === 'AssignmentExpression') {
          path.node.id = null;
        }
        const coverage = coverageForFiles[this.filename];
        if (!coverage) return;
        for (const fnNum in coverage.fnMap) {
          const fn = coverage.fnMap[fnNum];
          if (!isSameFunction(path.node, fn)) continue;
          const isDeadCode = coverage.f[fnNum] === 0;
          if (!isDeadCode) continue;
          /**
           * This is basically a repetition of the FunctionDeclarator visitor,
           * but the no-op here is anonymous instead of being named.
           */
          const noop = t.functionExpression(null, [], t.blockStatement([]));
          path.replaceWith(noop);
          return;
        }
      },
      Statement(path) {
        const coverage = coverageForFiles[this.filename];
        if (!coverage) return;
        for (const sNum in coverage.statementMap) {
          if (typeof sNum === 'undefined') continue;
          const s = coverage.statementMap[sNum];
          if (path.node && !isSameStatement(path.node.loc, s)) continue;
          const isDeadCode = coverage.s[sNum] === 0;
          if (!isDeadCode) continue;
          if (path.node) path.remove();
          return;
        }
      }
    }
  };
}

/**
 * Run the code through the Babel transform.
 */
const trimmedCode = babel.transform(templateCompilerCode, {
  filename: 'ember-template-compiler.js',
  plugins: [
    [ removeUnusedCode, {} ]
  ]
}).code;

writeFileSync('trimmed.js', trimmedCode);

/**
 * Run the transform against the the test that we ran against the instrumented
 * code in order to see if it still works with the code that we've removed.
 */
try {
  const precompile = (() => {
    const script = new vm.Script(trimmedCode);

    const context = new vm.createContext({
      module: {
        exports: {},
        // eslint-disable-next-line no-undef
        require
      }
    });

    script.runInNewContext(context);

    return context.module.exports.precompile;
  })();

  const afterTestOutput = precompile(test);

  /**
   * Validates whether our reduced version of the code
   * gives us the same output for the same input.
   */
  if (afterTestOutput === beforeTestOutput) {
    const percentCodeUnused = Math.round(100 - ((trimmedCode.length / templateCompilerCode.length) * 100));
    console.log(`Trimming succeeded!  ~${percentCodeUnused}% of the code was found to be unused.`);
    console.log(afterTestOutput);
  } else {
    console.warn('Output from trimmed code different from original!');
    console.log(`original: ${beforeTestOutput}`);
    console.log(`after   : ${afterTestOutput}`);
  }

} catch (err) {
  /**
   * Catch the error and show it so that files can still be written.
   */
  console.error(err);
}


/**
 * Output both a raw and uglified version.
 */
const uglifiedCode = Terser.minify(trimmedCode, {
  compress: {
    dead_code: true
  }
}).code;

writeFileSync('uglified.js', uglifiedCode);