/**
 * Một cửa cho kiểu dữ liệu API: re-export nguyên hợp đồng phía server để các
 * trang không phải viết đường dẫn `../../../src/dashboard/...` dài và dễ lệch.
 * Chỉ có kiểu - không kéo code chạy nào của src/ vào bundle.
 */
export type * from "../../src/dashboard/dashboard-api-contract.js";
