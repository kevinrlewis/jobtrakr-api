module.exports = function(
  original_name,
  encoding,
  mimetype,
  filename,
  filepath,
  size,
  filetypeid,
  db
) {
  return new Promise(function(resolve, reject) {
    // run create user function
    db.one('select insert_file(${original_name}, ${encoding}, ${mimetype}, ${filename}, ${filepath}, ${size}, ${filetypeid})',
    {
      original_name: original_name,
      encoding: encoding,
      mimetype: mimetype,
      filename: filename,
      filepath: filepath,
      size: size,
      filetypeid: filetypeid
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
