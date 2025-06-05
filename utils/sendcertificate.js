const fs = require('fs');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
require("dotenv").config();

// 📄 Helper to create PDF certificate
function generateCertificate(name, eventName) {
  const fileName = `certificates/${name.replace(/\s/g, "_")}_${Date.now()}.pdf`;

  if (!fs.existsSync('certificates')) {
    fs.mkdirSync('certificates');
  }

  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(fileName));

  doc.fontSize(28).text('Certificate of Participation', { align: 'center' });
  doc.moveDown();
  doc.fontSize(20).text(`This certifies that ${name}`, { align: 'center' });
  doc.moveDown();
  doc.text(`has successfully participated in "${eventName}"`, { align: 'center' });
  doc.end();

  return fileName;
}

// 📬 Helper to send email
async function sendEmail(to, name, filePath) {
  const transporter = nodemailer.createTransport({
    service: 'gmail', // Replace with your email provider
    auth: {
       user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
  }
  });

  const mailOptions = {
    from: `"MMK Universe Team" <${process.env.EMAIL_USER}>`,
    to: to,
    subject: 'Your Certificate',
    text: `Hi ${name},\n\nPlease find your participation certificate attached.`,
    attachments: [{ filename: 'certificate.pdf', path: filePath }]
  };

  await transporter.sendMail(mailOptions);
}

module.exports = {
  generateCertificate,
  sendEmail
};
