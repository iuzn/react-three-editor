import fs from "fs-extra"
import _debug from "debug"
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite"
import { NodePath, transformFromAst, types as t } from "@babel/core"
import gen from "@babel/generator"
import { parse, print } from "./recast"
import { createRPCServer } from "vite-dev-rpc"

let justEdited = {}

export default function editor(): Plugin {
  let config: ResolvedConfig
  function configureServer(server: ViteDevServer) {
    createRPCServer("vinxi", server.ws, {
      save(data) {
        try {
          transform(data)
        } catch (e) {
          console.log(e)
          throw e
        }
      }
    })
  }

  return {
    name: "vite-plugin-vinxi",
    enforce: "pre",
    handleHotUpdate(ctx) {
      console.log(ctx.file)
      if (justEdited[ctx.file]) {
        return []
      }
    },
    configResolved(_config) {
      config = _config
    },
    configureServer
  }
}

function transform(data: any) {
  if (!data) throw "no data"
  let source = fs.readFileSync(data.source.fileName).toString()

  const ast2 = parse(source, {
    parser: require("recast/parsers/babel-ts"),
    jsx: true
  })

  transformFromAst(ast2, undefined, {
    cloneInputAst: false,
    filename: data.source.fileName,
    ast: true,
    plugins: [
      () => {
        return {
          visitor: {
            JSXOpeningElement: (path: NodePath<t.JSXOpeningElement>) => {
              if (
                path.node.loc.start.line === data.source.lineNumber &&
                path.node.loc.start.column === data.source.columnNumber - 1
              ) {
                justEdited[data.source.fileName] = true
                Object.keys(data.value).forEach((v) => {
                  addAttribute(v)
                })
              }

              function addAttribute(prop) {
                let attr = path
                  .get("attributes")
                  .find(
                    (attr) =>
                      t.isJSXAttribute(attr) && attr.node.name.name === prop
                  )

                let value = data.value[prop]

                let expr = Array.isArray(value)
                  ? t.jsxExpressionContainer(
                      t.arrayExpression([
                        t.numericLiteral(value[0]),
                        t.numericLiteral(value[1]),
                        t.numericLiteral(value[2])
                      ])
                    )
                  : t.jsxExpressionContainer(t.booleanLiteral(value))

                if (attr) {
                  attr.set("value", expr)
                } else {
                  justEdited[data.source.fileName] = false
                  path.node.attributes.push(
                    t.jsxAttribute(t.jsxIdentifier(prop), expr)
                  )
                }
              }
            }
            // JSXAttribute: (attr: NodePath<t.JSXAttribute>) => {
            //   const element = attr.parentPath
            //   function addAttribute(attr, prop, value) {
            //     let expr = Array.isArray(value)
            //       ? t.jsxExpressionContainer(
            //           t.arrayExpression([
            //             t.numericLiteral(value[0]),
            //             t.numericLiteral(value[1]),
            //             t.numericLiteral(value[2])
            //           ])
            //         )
            //       : t.jsxExpressionContainer(t.booleanLiteral(value))
            //     if (attr) {
            //       let sourceLocation = attr.node.value
            //       expr.loc = sourceLocation.loc
            //       expr.start = sourceLocation.start
            //       expr.end = sourceLocation.end
            //       console.log(
            //         attr.node.value.expression.elements[0].value,
            //         value[0]
            //       )
            //       attr.node.value.expression.elements[0].value =
            //         value[0]
            //       // attr.get("value").replaceWith(expr)
            //       // attr
            //       //   .get("value")
            //       //   .get("expression")
            //       //   .get("elements")?.[0].node.value = value[0]
            //     } else {
            //       // path
            //       // path.node.attributes.push(
            //       //   t.jsxAttribute(t.jsxIdentifier(prop), expr)
            //       // )
            //     }
            //   }
            //   if (
            //     element.node.loc.start.line ===
            //       data.source.lineNumber &&
            //     element.node.loc.start.column ===
            //       data.source.columnNumber - 1 &&
            //     Object.keys(data.value).includes(attr.node.name.name)
            //   ) {
            //     addAttribute(
            //       attr,
            //       attr.node.name.name,
            //       data.value[attr.node.name.name]
            //     )
            //   }
            // }
          }
        }
      }
    ]
  })

  let babelCode = gen(ast2).code
  let code = print(ast2, {
    wrapColumn: 1000
  }).code

  console.log(babelCode, code)
  setTimeout(() => {
    delete justEdited[`${data.source.fileName}`]
  }, 1000)
  fs.writeFileSync(data.source.fileName, code)
}
