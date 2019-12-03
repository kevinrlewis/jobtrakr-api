var puppeteer = require('puppeteer');

module.exports = async(link) => {
  const browser = await puppeteer.launch({headless: false});
  // const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto(link);

  var titleSelector = '';
  var companySelector = '';
  if(link.includes('indeed')) {
    titleSelector = '.jobsearch-JobInfoHeader-title';
    companySelector = '.jobsearch-CompanyReview--heading';
  }

  const result = await page.evaluate((titleSelector, companySelector) => {
    let title = document.querySelector(titleSelector).innerText;
    let company = document.querySelector(companySelector).innerText;
    return { title: title, company: company };
  }, titleSelector, companySelector);
  console.log(result);
  browser.close();
  return result;
}
