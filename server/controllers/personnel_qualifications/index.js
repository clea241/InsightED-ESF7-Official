const express = require('express');
const router = express.Router();
const db = require('../../db');

// Update qualification details for a personnel record
router.put('/:personnel_id', async (req, res) => {
  const { personnel_id } = req.params;
  const { college_degree, major, minor, post_graduate_degree, discipline, eligibility, prc_specialization, prc_license_no, prc_expiry_date } = req.body;
  try {
    const result = await db.query(
      `UPDATE personnel_qualifications 
       SET college_degree = $1, major = $2, minor = $3, post_graduate_degree = $4, 
           discipline = $5, eligibility = $6, prc_specialization = $7, prc_license_no = $8, 
           prc_expiry_date = $9, updated_at = NOW()
       WHERE personnel_id = $10 RETURNING *`,
      [college_degree, major, minor, post_graduate_degree, discipline, eligibility, prc_specialization, prc_license_no, prc_expiry_date || null, personnel_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
