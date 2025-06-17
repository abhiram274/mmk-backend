const fs = require('fs');
// const PDFDocument = require('pdfkit');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const path = require('path');
const nodemailer = require('nodemailer');
require("dotenv").config();


// 👇 Helper to wrap long description text into lines
function wrapText(text, maxWidth, font, fontSize) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}



async function generateCertificate(name, eventName, description = "") {
  const templatePath = path.join(__dirname, '../template-certificate.pdf');
  const fileName = `certificates/${name.replace(/\s/g, "_")}_${Date.now()}.pdf`;

  if (!fs.existsSync('certificates')) {
    fs.mkdirSync('certificates');
  }

  const existingPdfBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];

  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = firstPage.getWidth();

  // 🧑 Name on underline
  const nameFontSize = 24;
  const nameWidth = font.widthOfTextAtSize(name, nameFontSize);
  const nameX = (pageWidth - nameWidth) / 2;
  const nameY = 310; // Adjusted to fall on the underline

  firstPage.drawText(name, {
    x: nameX,
    y: nameY,
    size: nameFontSize,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });



if (description) {
    description = description.replace(/\n/g, ' '); // ✅ Clean up line breaks

  const descFontSize = 14;
  const maxWidth = 400;
  const lineHeight = 18;

  const wrappedLines = wrapText(description, maxWidth, font, descFontSize);
  let currentY = nameY - 40;

  for (const line of wrappedLines) {
    const textWidth = font.widthOfTextAtSize(line, descFontSize);
    const textX = (pageWidth - textWidth) / 2;

    firstPage.drawText(line, {
      x: textX,
      y: currentY,
      size: descFontSize,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });

    currentY -= lineHeight;
  }
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
