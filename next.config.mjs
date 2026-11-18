/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // exceljs/pdfkit are server-only and should stay external to the server bundle.
    serverComponentsExternalPackages: ['pg', 'pdfkit', 'exceljs'],
  },
}

export default nextConfig
