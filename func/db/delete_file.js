module.exports = function(
  file_name,
  jobs_id,
  db
) {
  return new Promise(function(resolve, reject) {
    // run create user function
    db.one('select delete_file(${file_name}, ${jobs_id})',
    {
      file_name: file_name,
      jobs_id: jobs_id
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
