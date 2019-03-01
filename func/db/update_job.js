module.exports = function(
  user_id,
  jobs_id,
  job_title,
  company_name,
  link,
  notes,
  attachments,
  existingContacts,
  newContacts,
  db
) {
  console.log(user_id, jobs_id, job_title, company_name, link, notes, attachments, existingContacts, newContacts);
  return new Promise(function(resolve, reject) {
    db.one('select update_job(${user_id}, ${jobs_id}, CAST(${job_title} AS TEXT), CAST(${company_name} AS TEXT), CAST(${link} AS TEXT), CAST(${notes} AS TEXT), CAST(${attachments} AS TEXT[]), CAST(${existingContacts} AS JSON), CAST(${newContacts} AS JSON))',
    {
      user_id: user_id,
      jobs_id: jobs_id,
      job_title: job_title,
      company_name: company_name,
      link: link,
      notes: notes,
      attachments: attachments,
      existingContacts: existingContacts,
      newContacts: newContacts
    })
      // on success resolve promise
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
