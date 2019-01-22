module.exports = function(
  original_name,
  encoding,
  mimetype,
  filename,
  filepath,
  size,
  filetypeid,
  user_id,
  db
) {
  return new Promise(function(resolve, reject) {
    // run create user function
    db.one('select insert_profile_image(${original_name}, ${encoding}, ${mimetype}, ${filename}, ${filepath}, ${size}, ${filetypeid}, ${user_id})',
    {
      original_name: original_name,
      encoding: encoding,
      mimetype: mimetype,
      filename: filename,
      filepath: filepath,
      size: size,
      filetypeid: filetypeid,
      user_id: user_id
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
