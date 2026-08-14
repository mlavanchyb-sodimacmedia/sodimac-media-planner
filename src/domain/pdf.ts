import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function exportPdf(
  elementId: string,
  fileName: string,
) {
  try {
    console.log("PDF START");

    const element =
      document.getElementById(
        elementId,
      );

    console.log(
      "ELEMENT:",
      element,
    );

    if (!element) {
      alert(
        "No se encontró proposal-content",
      );
      return;
    }

    const canvas =
      await html2canvas(
        element,
        {
          scale: 2,
          useCORS: true,
          logging: true,
        },
      );

    console.log(
      "CANVAS OK",
    );

    const image =
      canvas.toDataURL(
        "image/png",
      );

    const pdf =
      new jsPDF(
        "p",
        "mm",
        "a4",
      );

    const width = 210;

    const height =
      (canvas.height *
        width) /
      canvas.width;

    console.log(
      "PDF DIMENSIONS",
      width,
      height,
    );

    let heightLeft =
  height;

let position = 0;

pdf.addImage(
  image,
  "PNG",
  0,
  position,
  width,
  height,
);

heightLeft -= 297;

while (heightLeft > 0) {

  position =
    heightLeft -
    height;

  pdf.addPage();

  pdf.addImage(
    image,
    "PNG",
    0,
    position,
    width,
    height,
  );

  heightLeft -= 297;
}

console.log(
  "SAVING PDF",
);

pdf.save(fileName);

console.log(
  "PDF DONE",
);
  } catch (error) {
    console.error(
      "PDF ERROR",
      error,
    );

    alert(
      `PDF ERROR: ${error}`,
    );
  }
}
