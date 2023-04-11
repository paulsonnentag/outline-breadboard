import * as ohm from "ohm-js"

export const grammar = ohm.grammar(`
Node {
  Bullet
    = (Key ":")? Value*

  Key
    = propertyChar+

  Value
    = numberLiteral
    | TextPart+
    
  TextPart
    = InlineExp
    | IdRef
    | MethodExp
    | TextLiteral

  InlineExp
    = "{" Exp? "}"
  
  MethodExp
    = "#" letter+ "(" Argument* ")"

  TextLiteral = textChar+

  textChar
    = ~("{"| "#") any

  Exp = AddExp
  
  SimpleExp
    = AccessExp
    | FunctionExp
    | StringLiteral
    | numberLiteral
    | IdRef
    | nameRef

  nameRef
    = propertyChar+

  AccessExp
    = SimpleExp "." PropertyName

  PropertyName
    = propertyChar+

  propertyChar
    = alnum | "_"

  StringLiteral
    = "\\"" StringChar+ "\\""

  numberLiteral
    = digit+

  IdRefChar
    = alnum | "_" | "-" | "/" 

  IdRef
    = "#[" IdRefChar+ "]"

  StringChar
    = alnum | "." | ":" | ">" | "-" | "(" | ")" | "[" | "]" | "=" | "'" | "/" | "*" | "!" | "$" | "_"

  FunctionExp
    = letter+ "(" Argument* ")"
        
  Argument 
    = (Key ":")? Exp ","?
    | Key ":" Exp? ","?

  AddExp
    = AddExp "+" MulExp --plus
    | AddExp "-" MulExp --minus
    | MulExp

  MulExp
    = MulExp "*" SimpleExp --times
    | MulExp "/" SimpleExp --divide
    | SimpleExp
}
`)
