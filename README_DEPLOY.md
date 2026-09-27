# Bản đồ Thủy lợi V12.3

## Điểm sửa cuối
- Giữ nguyên lõi bản đồ V12.x và GIS 15.197 đối tượng.
- Sửa lỗi nghiêm trọng: standalone bootstrap không gọi được `initAiMap()` vì hàm chưa được expose ra `window`. V12.3 thêm `window.initAiMap = initAiMap`.
- Chỉ dùng `wrangler.toml`; loại bỏ `wrangler.jsonc` xung đột.
- Static Assets dùng thư mục gốc `.`; không dùng `public/`.
- Runtime GIS: `/gis/master.geojson`.
