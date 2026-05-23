/**
 * Гадаад placeholder сервер (via.placeholder гэх мэт)-ээс үл хамааран зураг үзүүлнэ —
 * офлайн / VPN / firewall-д net::ERR_CONNECTION_CLOSED гарахгүй.
 */
function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Бараа зураггүй үед каталогийн зураглал */
export const PRODUCT_IMAGE_PLACEHOLDER = svgDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">
    <rect fill="#f3f4f6" width="400" height="500"/>
    <path d="M120 332l72-82 118 138 62-92 118 154V460H72V332h48zm176-206a48 48 0 11-96 0 48 48 0 0196 0z" fill="#d1d5db" opacity=".55"/>
    <text x="200" y="475" fill="#9ca3af" font-size="15" font-family="system-ui,sans-serif" text-anchor="middle">Зураг байхгүй</text>
  </svg>`,
);

/** Хүргэлтийн үйлчилгээний суур зураглал */
export const DELIVERY_IMAGE_PLACEHOLDER = svgDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">
    <rect fill="#eff6ff" width="400" height="500"/>
    <path d="M80 352h208l-48-176H128l-48 176zm248-144l40 144h72V208h-112zM160 392a32 32 0 110-64 32 32 0 010 64zm160 0a32 32 0 110-64 32 32 0 010 64z" fill="#93c5fd" opacity=".6"/>
    <text x="200" y="475" fill="#64748b" font-size="15" font-family="system-ui,sans-serif" text-anchor="middle">Хүргэлт</text>
  </svg>`,
);
