module.exports = function(
  pocs,
  db
) {
  return new Promise(function(resolve, reject) {
    // run create user function
    db.one('select insert_contact(${pocs})',
    {
      pocs: JSON.stringify(pocs)
    })
      // on successful insertion resolve promise
      .then(function(data) {
        resolve(data);
      })
      // on query error, reject and return error
      .catch(function(error) {
        console.log('ERROR:', error);
        reject(Error(error));
      });
  });
}
