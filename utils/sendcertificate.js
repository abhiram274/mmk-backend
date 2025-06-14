const fs = require('fs');
// const PDFDocument = require('pdfkit');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const nodemailer = require('nodemailer');
require("dotenv").config();

// 📄 Helper to create PDF certificate
// function generateCertificate(name, eventName) {
//   const fileName = `certificates/${name.replace(/\s/g, "_")}_${Date.now()}.pdf`;

//   if (!fs.existsSync('certificates')) {
//     fs.mkdirSync('certificates');
//   }

//   const doc = new PDFDocument();
//   doc.pipe(fs.createWriteStream(fileName));

//   doc.fontSize(28).text('Certificate of Participation', { align: 'center' });
//   doc.moveDown();
//   doc.fontSize(20).text(`This certifies that ${name}`, { align: 'center' });
//   doc.moveDown();
//   doc.text(`has successfully participated in "${eventName}"`, { align: 'center' });
//   doc.end();

//   return fileName;
// }

async function generateCertificate(name, eventName, description = "") {
  const templatePath = path.join(__dirname, '../template-certificate.pdf'); // Update if different
  const fileName = `certificates/${name.replace(/\s/g, "_")}_${Date.now()}.pdf`;

  if (!fs.existsSync('certificates')) {
    fs.mkdirSync('certificates');
  }

  const existingPdfBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];

  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 18;

  // These coordinates are example values — you need to adjust them based on your template layout
  firstPage.drawText(name, {
    x: 200,
    y: 300,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });

  firstPage.drawText(eventName, {
    x: 200,
    y: 270,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  });

  if (description) {
    firstPage.drawText(description, {
      x: 200,
      y: 240,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(fileName, pdfBytes);
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
