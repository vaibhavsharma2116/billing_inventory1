const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx')) results.push(file);
    }
  });
  return results;
}

const files = walk(path.join(__dirname, 'src'));
let changedCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  let original = content;

  // 1. Make sure downloadReportExcel is imported if downloadReportPdf is
  if (content.includes('downloadReportPdf') && !content.includes('downloadReportExcel')) {
    content = content.replace('downloadReportPdf', 'downloadReportPdf, downloadReportExcel');
  }

  // 2. Replace the Buttons
  // We look for <Button ...> ... Download PDF ... </Button>
  // We need to capture the onClick handler, whether it's exportPdf or () => downloadReportPdf(...)
  
  // This regex finds the entire <Button ... onClick={...}> ... Download PDF ... </Button>
  const buttonRegex = /<Button([^>]*)onClick=\{([^}]+)\}([^>]*)>(.*?)Download PDF(.*?)<\/Button>/gs;
  
  content = content.replace(buttonRegex, (match, beforeClick, onClickContent, afterClick, innerBefore, innerAfter) => {
    // If onClickContent is just a function name like `exportPdf`, we need to change it to exportExcel for the new button
    let excelOnClick = onClickContent;
    if (onClickContent.includes('downloadReportPdf')) {
      excelOnClick = onClickContent.replace('downloadReportPdf', 'downloadReportExcel');
    } else if (onClickContent.match(/^[a-zA-Z0-9_]+$/)) {
      // It's a reference to a function, e.g. exportPdf.
      // We assume there's a corresponding exportExcel function if we create it.
      // But we can't easily create it unless we rewrite the function.
      // Wait! If the function is `exportPdf`, what if we just invoke it but hijack downloadReportPdf globally? No.
      // Let's just create an inline Excel onClick:
      // Actually, if it's exportPdf, we can replace it with exportPdf().then(...) NO, that doesn't work.
    }
    
    // Instead of regex replacing the button, let's just do a simpler string replace for the files we know.
    return match; // cancel for now, need a better strategy
  });

  if (content !== original) {
    // fs.writeFileSync(file, content, 'utf-8');
    // changedCount++;
  }
}
console.log('Processed');
