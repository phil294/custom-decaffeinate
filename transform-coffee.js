/* eslint-disable */

let { readFileSync } = require("fs")
let { compile } = require("coffeescript")

function preprocess_coffee(old_coffee) {
  // return {coffee:old_coffee}
  const tmp = old_coffee

    // non-coffeesense special stuff:

    .replaceAll(/([a-zA-Z0-9_$)\]]|^\s*)\?(\(|\.|\[)/mg, '$1.__SPECIAL__QUESTION_MARK__$2') // output es6 optional chaining instead of cs nonsense

    .replaceAll(/(\S) \? (\S)/g, '$1 || __SPECIAL__NULLISH__ || $2') // output nullish coalescing instead of cs existential operator output nonsense

    .replaceAll(/\n(\s*)\n(\s*)/g, '\n$2#\n$2')

    .replaceAll(/\n(\s*((let|var) )?\S+ = (\([^\n]+?\) )?)=>\n/mg, '\n$1->\n') // alters logic
    .replaceAll(/\n(\s*((let|var) )?\S+ = (\([^\n]+?\) )?)=>\n/mg, '\n$1->\n') // alters logic
    .replaceAll(/\n(\s*((let|var) )?\S+ = (\([^\n]+?\) )?)=>\n/mg, '\n$1->\n') // alters logic
    .replaceAll(/\n(\s*((let|var) )?\S+ = (\([^\n]+?\) )?)=>\n/mg, '\n$1->\n') // alters logic

    .replaceAll(/\n(\s*\S+: (\([^\n]+?\) )?)=>\n/mg, '\n$1->\n') // alters logic
    .replaceAll(/\n(\s*\S+: (\([^\n]+?\) )?)=>\n/mg, '\n$1->\n') // alters logic
    .replaceAll(/\n(\s*\S+: (\([^\n]+?\) )?)=>\n/mg, '\n$1->\n') // alters logic
    .replaceAll(/\n(\s*\S+: (\([^\n]+?\) )?)=>\n/mg, '\n$1->\n') // alters logic

    // disable the collecting and returning of for-loop comprehensions, things need to be returned explicitly (favoring functional programming, also avoiding un-pureness)
    .replaceAll(/^(([ \t]*)for .+$(\n^(\2[ \t]+.+|\s*# .*)$)+)/gm, '$1\n$2undefined # __SPECIAL__LOOP_STOPPER\n')

    // prevent some invalid block comment placements
    // .replaceAll(/^\s*\/\*\*/gm, '``\n/**')

    .replaceAll(/^(\s*)for +([^ ]+),\s*([^ ]+) of (.+)$/mg, '$1for [$2, $3] from Object.entries($4)')
    .replaceAll(/^(\s*)for +([^ ]+),\s*([^ ]+) in (.+)$/mg, '$1for [$3, $2] from Object.entries($4)')
    .replaceAll(/^(\s*)for +([^ ]+) in (.+)$/mg, '$1for $2 from $3')
    .replaceAll(/( from Object.entries\([^)]+) by -1\)/g, '$1).reverse()')

    .replaceAll('\n', '\n# __SPECIAL__NEWLINE_1\n')

  // console.log(tmp)
  // process.exit(1)

  const tmp_lines = tmp.split("\n")

  const starts_with_block_comment_lines = tmp_lines
    .map(line => line.match(/^\s*###([^#]|$)/gm))
    .map((match, line_i) => (match ? line_i : -1))
    .filter(line_i => line_i > -1)
    .map(
      (line_i, i) =>
        // Eg. if block comment lines were detected and prefixed with a single # line
        // at i=2 and i=4, the array will contain [2,5] so we can iterate and modify
        // arrays from the beginning here and in postprocess_js.
        line_i + i
    )

  for (const line_i of starts_with_block_comment_lines) {
    // Arrange for block comments to be placed directly before their below line in JS (#1)
    // Inserts extra lines that need to be tracked so the source maps can be adjusted. That's
    // also why this needs to happen before object_tweak_coffee_lines.
    // Couldn't find a solution that does not insert extra lines:
    // - prefix all ### with another "# " -> long block comment sections become code
    // - prefix with backticks: ### -> ``### -> fails inside objects or multiline assignments
    tmp_lines.splice(line_i, 0, "#")
  }

  const new_coffee = tmp_lines.join("\n")
  return {
    coffee: new_coffee,
  }
}

/** using official coffeescript compiler */
function try_compile_coffee(coffee) {
  try {
    // takes about 1-4 ms
    const response = compile(coffee, { sourceMap: true, bare: true })
    return {
      source_map: response.sourceMap.lines,
      js: response.js
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (compilation_error) {
    if (compilation_error.name !== "SyntaxError") throw compilation_error
    return {
      diagnostics: [
        {
          range: null,
          severity: "error",
          message: compilation_error.message,
          tags: [],
          code: 0,
          source: "CoffeeSense"
        }
      ]
    }
  }
}

const try_translate_coffee = coffee => {
  let result = {}

  // Try normal compilation
  result = try_compile_coffee(coffee)

  if (result.js) {
    return result
  } else {
    console.log(coffee)
    console.warn(result)
    throw "could not compile"
  }
}

/**
 * Applies some transformations to the JS in result and updates source_map accordingly.
 * These transforms do not depend on any previous information.
 */
function postprocess_js(result) {
  if (!result.js || !result.source_map) return

  result.js = result.js


    // prefer non-return syntax while keeping newline where intended
    .replaceAll(/(\(.*\) =>) \{\n\s+\/\/ __SPECIAL__NEWLINE_1\n\s+return ([^;\n]+);?\n\s*\}/g, '$1\n// __SPECIAL__NEWLINE_1\n$2')

    // Prefer object method shorthand
    .replaceAll(
      /([a-zA-Z0-9_$]+): (async )?function(\*?)\(/g,
      (_, func_name, asynk, asterisk) =>
        `${asynk || ""}${asterisk}${func_name}          (`
    )
    // coffee `for x in y` becomes a for-loop, and `x` is in the next line defined as
    // `y[i]`. This gives errors with strict null checks, so add a type guard:
    // .replaceAll(
    //   /^(\s*)for \(.+\) \{\n\1  var ([^ ]+) = \S+\];/gm,
    //   (all, indent, varname) =>
    //     `${all} if (${varname} === undefined) throw 'CoffeeSense strict null check';`
    // )

    // s.a.
    .replaceAll('.__SPECIAL__QUESTION_MARK__', '?')

    // .
    .replaceAll(/(^|\n)(import [^\n]+|[^=]+ = .*require\([^\n]+)\n\n(import [^\n]+|[^=]+ = .*require\([^\n]+)\n/gm, '$1$2\n$3\n')
    .replaceAll(/(^|\n)(import [^\n]+|[^=]+ = .*require\([^\n]+)\n\n(import [^\n]+|[^=]+ = .*require\([^\n]+)\n/gm, '$1$2\n$3\n')
    .replaceAll(/(^|\n)(import [^\n]+|[^=]+ = .*require\([^\n]+)\n\n(import [^\n]+|[^=]+ = .*require\([^\n]+)\n/gm, '$1$2\n$3\n')
    .replaceAll(/(^|\n)(import [^\n]+|[^=]+ = .*require\([^\n]+)\n\n(import [^\n]+|[^=]+ = .*require\([^\n]+)\n/gm, '$1$2\n$3\n')

    .replaceAll('|| __SPECIAL__NULLISH__ ||', '??')

    // inline multiline destructurings and requires because otherwise the below var decl big match regex never completes
    .replaceAll(/\{\n([a-zA-Z0-9_$ :\/]+,?\n)+\s*\}/gm, m => m.replaceAll('\n', '').replaceAll('// __SPECIAL__NEWLINE_1', ''))

    .replaceAll(/( from ['"].+\.)coffee(['"];?)\n/g, '$1js$2\n')

    // skip unnecessary extra ref creations (repeated below)
    .replaceAll(/^\s*(ref[0-9]*) = (.+?);?\n((^\s*\/\/.*\n)*)(\s*for \(.+ of )(\1)\)/gm, '$3$5$2)')


  let js_lines = result.js.split("\n")

  // console.time('var-decl-fix')
  //////////////////////////////////////
  ///////// Modify variable declarations to solve various TS compiler errors:
  ///////// Note: All of this is now only needed for when a CS assignment has a block comment before it (see issue #1)
  // Should not be error but is:
  // xy = 123   # Error: Variable 'xy' implicitly has type 'any' in some locations where its type cannot be determined.CoffeeSense [TS](7034)
  // => xy      # Error: Variable 'xy' implicitly has an 'any' type.CoffeeSense [TS](7005)
  //////// and
  // Should be error but is not:
  // a = 1
  // a = 'one'
  /////// This is because the cs compiler puts variable declarations to the front:
  // Translates to:
  // var a;
  // a = 1;
  // a = 'one';
  /////// and now `a` is of type `number | string` (https://github.com/microsoft/TypeScript/issues/45369).
  // Below is a hacky workaround that should fix these issues in most cases. It moves the
  // declaration part (`var`) down to the variable's first implementation position.
  // This works only with easy implementations:
  /*
  var a, b, c;
  a = 1;
  [b] = 2;
  ({c} = 3);
  */
  // Shall become:
  /*
  var b, c;
  let a = 1;               // added let
  [b] = 2;                 // unchanged because of surrounding braces
  ({c} = 3);               //
  */
  // similarly, array destructors with more than one variable cannot be changed.
  // Returns stay untouched (return x = 1) too.
  let did_change_any = true
  let jy=0
  let yhjhgjfk = 0
  while(did_change_any !== false) {
    jy++
    // console.warn(1)
    did_change_any = false
    const js_line_nos = Array.from(Array(js_lines.length).keys())
    // Part 1: Determine declaration areas (`   var x, y;`)
    const js_decl_lines_info = js_line_nos
      .map(decl_line_no => {
        const match = js_lines[decl_line_no].match(/^(\s*)(var )([^\n=]+);$/)
        if (match) {
          // console.warn(match[0])
          const var_decl_infos = match[3].split(", ").map(var_name => ({
            var_name,
            decl_indent: match[1].length,
            decl_line_no
          }))
          // console.log(var_decl_infos)
          // process.exit(1)
          return {
            decl_line_no,
            var_decl_infos
          }
        }
        return null
      })
      .filter(Boolean)
    // if(jy==2) {
    //   console.log(js_lines.join('\n'))
    //   process.exit(1)
    // }
    // console.warn(js_decl_lines_info.length)
    // Part 2: For each `var` decl, find fitting first impl statement
    // (`x = 1`), if present, and return new line content (`let x = 1`).
    // Might as well be `var x = 1` but this helps differentiating/debugging
    // console.log(js_decl_lines_info)
    // process.exit(1)
    const js_impl_line_changes = js_decl_lines_info
      .map(info => info.var_decl_infos)
      .flat()
      .filter(i => !i.var_name.startsWith('ref'))
      .map(({ var_name, decl_indent, decl_line_no }, tgjgs_i) => {
        if(did_change_any !== false)
        // if(did_change_any)
          return null
        // else console.warn('continue because ',did_change_any)
        // console.log(var_name, decl_line_no)
        let wsasdf = js_lines.slice(0, decl_line_no)
        const lines_up_to_decl = wsasdf.length ? wsasdf.join('\n') + '\n' : ''
        const impl_lines_body = js_lines.slice(decl_line_no).join('\n')
        let ugudfguwtg = 0
        for(const var_impl_match of impl_lines_body
          .matchAll(new RegExp("\n([ \\t]*)(let )?((\\(\\{)?\\[?)(( *[a-zA-Z0-9_$: ]+,)* *([a-zA-Z0-9_$]+: )?" + var_name + "(, *[a-zA-Z0-9_$: ]+)*\n? *?\\]?\\}? = \\S)", "g"))) {
          // .matchAll(new RegExp("\n([ \\t]*)(let )?((\\(\\{)?\\[?)\n?(( *[a-zA-Z0-9_$: ]+,\n?)* *([a-zA-Z0-9_$]+: )?" + var_name + "\b)", "g")))
          ugudfguwtg++
          const impl_whitespace = var_impl_match[1]
          const impl_indent = impl_whitespace.length
          if (impl_indent < decl_indent)
            // Parent block scope. Need to skip this variable then, no impl has been found
            // before current block got closed. It is important to stop here, as otherwise
            // it might later match an impl from *another* decl of the same var name
            return null
          // const var_impl_text = `${var_name} = `
          if (var_impl_match) {
            // if (impl_indent > decl_indent)
            //   // This is a conditional first value assignment and type can not safely be set
            //   // as it may also be declared in the other condition branch
            //   return null

            // console.warn(var_impl_match[3])
            // console.warn(`${impl_whitespace}${var_impl_match[2] ? '' : 'let '}${var_impl_match[3]}`)

// if(jy==8){
            // console.log(js_lines.join('\n'))
            // // console.log(var_impl_match)
            // process.exit(1)
// }

// if(yhjhgjfk == 1) {
  // console.log(impl_lines_body.slice(0, var_impl_match.index))
  // process.exit(1)
// }
            js_lines = (lines_up_to_decl
              + impl_lines_body.slice(0, var_impl_match.index)
              + `\n${impl_whitespace}let ${var_impl_match[3]}${var_impl_match[5]}`
                  .replace(/(let )\((.+ = require\(.+)\);$/, '$1$2')
              + impl_lines_body.slice(var_impl_match.index + var_impl_match[0].length))
                      // .replaceAll(/(let )\((.+ = require\(.+)\);/g, '$1$2')
                        // let ({basename, relative, isAbsolute} = require('path'));
              .split('\n')
            yhjhgjfk++

            did_change_any = decl_line_no
            return {
              var_name,
              decl_line_no,
            }
          }
        }
        // console.log(3)
        return null
      })
      .filter(Boolean)
    // Part 3: Apply Part 2 changes and update source maps of those lines
    // *(*(outdated for (const change of js_impl_line_changes) {
    // *(*(outdated   js_lines[change.impl_line_no] = change.new_line_content
    // *(*(outdated }

    // Part 4: Update decl lines (Part 1). Where no impl lines were found (Part 2),
    // keep them. If all were modified, an empty line will be put.
    // for (const decl_line_info of js_decl_lines_info) {
    // console.warn(js_decl_lines_info, 'xxxxx', js_decl_lines_info.filter(i => i.decl_line_no === did_change_any))
    js_decl_lines_info.filter(i => i.decl_line_no === did_change_any).forEach(decl_line_info => {
      // console.log(did_change_any)
      // process.exit(1)
      let new_decl_line = decl_line_info.var_decl_infos
        .filter(
          decl_info =>
            !js_impl_line_changes.some(
              impl_change =>
                impl_change.var_name === decl_info.var_name &&
                impl_change.decl_line_no === decl_info.decl_line_no
            )
        )
        .map(i => i.var_name)
        .join(", ")
      if (new_decl_line)
        // Those that could not be changed
        new_decl_line = "var " + new_decl_line + ";"
      js_lines[decl_line_info.decl_line_no] = new_decl_line
    })
  }


  result.js = js_lines.join("\n")
    // let ({ => let {
    .replaceAll(/^(\s*let )\((\{[^;]+)\);$/gm, '$1$2;')
    // writing `return undefined` here doesn't work because js can't match it??? even though it IS the word "undefined"
    .replaceAll(/^\s*(void 0|return [^;]+);? \/\/ __SPECIAL__LOOP_STOPPER$\n/gm, '')
    .replaceAll(/(\s)return ((?!ref[0-9]*)[a-zA-Z_\$]\S* = \S+)/g, '$1$2')
    // left-side optional chaining fix
    .replaceAll(/^\s*([^\n =?]+)\?((\(|\.|\[)([^\n=?]+) = )/gm, 'if($1) $1$2')
    .replaceAll(/([a-zA-Z0-9_$)\]])\?(\[|\()/g, '$1?.$2')

    // continuation of the object.entries thing from above
    .replaceAll(/^(\s*for \()([a-z]+[0-9]*)( of Object.entries\(.+\n)\s+(let )?(\[[^ ]+, [^ ]+\]) = \2;\n/gm, '$1let $5$3')
    .replaceAll(/^(\s*for \()let \[_, ([^ ]+)\] of Object.entries\((.+)$/gm, '$1let $2 of Object.values($3')

    .replaceAll(/^( +\*\n)+( *\*\/)$/gm, '$2')
    .replaceAll(/^(\s*)(\/\*\*)( @typedef \{\{\n)/gm, '$1$2$1$3') // inserts extra newline somehow

    .replaceAll(/(import\([^)]+)\.coffee(['"]\))/g, '$1$2')

    .replaceAll(/( \/\/ (?!__SPECIAL__NEWLINE_1).+)\n/g, '$1__SPECIAL__COMMENT_END')

      // only keep explicit gaps in code
    .replaceAll('\n', '')
    .replaceAll('// __SPECIAL__NEWLINE_1', '\n')

    .replaceAll(/__SPECIAL__COMMENT_END([^\n])/g, '\n$1') // because special newline logic doesnt work for inline comments around loops

    .replaceAll(';import ', '\nimport ')

    .replaceAll(/[\t ]*(\/\/|\*|#) __SPECIAL__NEWLINE_1/gm, '\n')
    .replaceAll(/^(.*) \/\/ __SPECIAL__NEWLINE_1/gm, '$1')

    .replaceAll(/(\n\s*\S[^\n]*?\}) else \{/g, '$1\nelse {')

    .replaceAll(/; *(ref[0-9]* = )/g, '\n$1')
    // skip unnecessary extra ref creations (repeated above)
    .replaceAll(/^\s*(ref[0-9]*) = (.+?);? *;?\n((^\s*\/\/.*\n)*)(\s*for \(.+ of )(\1)\)/gm, '$3$5$2)')

    .replaceAll(/; *(return$|return |export |try |if |break$|ref[0-9]* = )/mg, '\n$1 ')

    .replaceAll(/(\s)return; *(\S)/g, '$1return\n$2')


}

const raw_coffee = readFileSync(process.argv[2], "utf-8")

const {
  coffee: preprocessed_coffee,
} = preprocess_coffee(raw_coffee)
// As coffee was modified, offsets and positions are changed and for these purposes,
// we need to construct a new doc
let result = try_translate_coffee(preprocessed_coffee)

postprocess_js(result)

console.log(result.js)
