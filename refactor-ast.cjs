const { Project, SyntaxKind } = require('ts-morph');
const fs = require('fs');

const project = new Project({
  tsConfigFilePath: "tsconfig.app.json",
});

const sourceFiles = project.getSourceFiles("src/**/*.tsx");
let changedFiles = 0;

for (const sf of sourceFiles) {
  const text = sf.getFullText();
  if (!text.includes("downloadReportPdf")) continue;
  if (!text.includes("Download PDF")) continue; // Only UI files

  // 1. Ensure downloadReportExcel is imported
  const importDecls = sf.getImportDeclarations();
  let foundExcel = false;
  let reportPdfImport = null;
  for (const imp of importDecls) {
    if (imp.getModuleSpecifierValue() === "@/lib/report-pdf") {
      reportPdfImport = imp;
      for (const named of imp.getNamedImports()) {
        if (named.getName() === "downloadReportExcel") foundExcel = true;
      }
    }
  }
  if (reportPdfImport && !foundExcel) {
    reportPdfImport.addNamedImport("downloadReportExcel");
  }

  let fileChanged = false;

  // 2. Find all CallExpressions of downloadReportPdf
  const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter(c => c.getExpression().getText() === "downloadReportPdf");
  
  for (const call of calls) {
    const parentFn = call.getFirstAncestorByKind(SyntaxKind.ArrowFunction) || call.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
    if (!parentFn) continue;

    // Check if the parent function is used as an onClick handler directly in JSX
    // Or if it's assigned to a variable like `const exportPdf = () => ...`
    const varDecl = parentFn.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    
    // We will extract the argument of downloadReportPdf (the data object)
    const args = call.getArguments();
    if (args.length === 0) continue;
    const dataObj = args[0].getText();
    
    // Replace downloadReportPdf(...) with a generic callback wrapper?
    // Actually, no. Let's just find the JSX elements that contain "Download PDF"
  }

  // A different approach: Find all JSX Elements containing "Download PDF"
  const buttons = sf.getDescendantsOfKind(SyntaxKind.JsxElement)
    .filter(n => n.getOpeningElement().getTagNameNode().getText() === "Button" && n.getText().includes("Download PDF"));
  const selfClosingButtons = sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
     .filter(n => n.getTagNameNode().getText() === "Button" && n.getText().includes("Download PDF"));
     
  // Instead of modifying AST heavily, since AST manipulation of JSX is buggy in ts-morph,
  // Let's do it via string replacement based on positions.
}
