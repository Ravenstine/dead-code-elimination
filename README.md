Dead Code Elimination
=====================

This was an experiment I did in using code coverage analysis to shrink code by removing code that doesn't get used for a particular input.  It uses [Babel](https://babeljs.io/) to transform the code and [babel-plugin-istanbul](https://github.com/istanbuljs/babel-plugin-istanbul) to analyze what code gets touched.

I don't know how practical this approach really is since it requires very specific test input, but I imagine it may be a good way to "extract" functionality from a large library without having to manually dig through and pull out the parts that aren't needed.  This experiment was just to entertain the idea that code coverage, normally used for application testing, could be used to shrink code.

## Description

The library to be shrunk in this experiment is the [Ember](https://emberjs.com) template compiler, which normally comes with Ember CLI projects in the [ember-source](https://www.npmjs.com/package/ember-source) package.  This library is used to on the backend to precompile templates that render web content in the browser; although it's possible to use it in the frontend, this isn't common because of its file size.

Because I want to use it in the frontend, I was inspired ot find a way to do so without having to download too many extra kilobytes.  I wondered if it would be possible to use the same tools we use for code coverage to eliminate code that never gets touched.  By running the code and capturing what lines weren't and weren't touched for the given input, we should be able shrink our code and keep the same output.

You can learn more about how I've accomplished this in a very small way by reading `build.js`.

### Findings

At the time of this writing, `ember-template-compiler.js` is reported as being 484 kB on my file system.  Upon running `npm run`, the output file called `trimmed.js` is reported as being 297 kB, which is a 38.6% decrease in size.

## Usage

Simply run `npm run` to build a trimmed version of the `ember-template-compiler`.

This command will write 4 files for each step into the main directory:

- `original.js` - The untouched `ember-template-compiler` code.
- `instrumented.js` - The code that's been instrumented for code coverage analysis using `babel-plugin-istanbul`.
- `trimmed.js` - The code that's been had unused code(for the given test input) eliminated.
- `uglified.js` - The same as `trimmed.js` except compressed using [Terser](https://github.com/terser/terser).

Each of these files an be `require`'d in Node.js.

## License

See `LICENSE.txt`.