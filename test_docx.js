const docx = require('docx');
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;

async function test() {
    try {
        const doc = new Document({
            sections: [{
                children: [
                    new Paragraph({ text: 'Hello Stacy', heading: HeadingLevel.TITLE }),
                    new Paragraph({ text: 'This is a test document.' })
                ]
            }]
        });
        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync('test_docx.docx', buffer);
        console.log('Success creating DOCX');
    } catch (err) {
        console.error('Error creating DOCX:', err);
    }
}
test();
