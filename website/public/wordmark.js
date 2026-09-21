// The wordmark in the footer of the plain pages. It lives in a file of its own rather than in the page,
// because the site's content security policy runs no script written inside a page.
document.querySelectorAll('.wmLink').forEach((el) => { el.innerHTML = Brand.wordmark(); });
