# Logo Assets Directory

This directory contains logo and image assets used in PDF report generation.

## Required Files

- **MAK logo_consulting.jpg** - The main company logo used in Density Reports and other PDF documents.

## Logo Placement

The logo file should be placed directly in this directory:
```
server/public/MAK logo_consulting.jpg
```

## Usage

The logo is automatically embedded as a base64 data URI in generated PDFs. If the logo file is not found, a placeholder will be displayed instead.

## Notes

- The logo is embedded directly in the HTML/PDF, so no external URL is required
- Logo dimensions are automatically constrained to 120px width x 80px height while maintaining aspect ratio
- The logo appears in the top-right corner of report headers

