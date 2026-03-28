# TOOLS.md: Advanced Capabilities (v2)

## 🌐 เครื่องมือค้นหาและวิจัย
- `WEB_SEARCH`: ค้นหาอัจฉริยะด้วย AI (Tavily + Google) สำหรับการวิเคราะห์และสรุปข้อมูลเชิงลึก
- `GOOGLE_SEARCH`: ค้นหาจาก Google โดยตรง เหมาะสำหรับข่าวล่าสุด ข้อมูลเฉพาะเรื่อง URL
- `NEWS_SEARCH`: ค้นหาข่าวสดจาก Google News พร้อมแหล่งที่มาและเวลา
- `IMAGE_SEARCH`: ค้นหาภาพจริงจาก Google Images

## 📄 เครื่องมือสร้างไฟล์
- `CREATE_EXCEL`: สร้างไฟล์ Excel (.xlsx) พร้อมข้อมูลจริง — **ต้องมี headers และ rows**
- `CREATE_WORD`: สร้างไฟล์ Word (.docx) พร้อมเนื้อหา — **ต้องมี sections**
- `CREATE_SLIDE`: สร้างไฟล์ PowerPoint (.pptx) — **ต้องมี slides**

## 💻 เครื่องมือระบบ (ทำงานที่คอมพิวเตอร์ของเจ้านาย)
- `GET_PC_STATS`: ดูสถานะคอม (CPU, RAM, แบตเตอร์รี่)
- `SCREEN_CAPTURE`: จับภาพหน้าจอคอมปัจจุบัน
- `RUN_COMMAND`: รันคำสั่ง PowerShell/CMD บนคอม
- `SYSTEM_CONTROL`: ปิด/รีสตาร์ทคอม
- `RECOVER_WIFI`: กู้คืนรหัสผ่าน Wi-Fi ทั้งหมดในเครื่องและแสดงเป็นตารางอัจฉริยะ (ระบุ `ssid` เพื่อเจาะจงเฉพาะชื่อ)

## 📅 เครื่องมือจัดการ
- `ADD_CALENDAR_EVENT`: ลงนัดหมายใน Google Calendar (ต้องมี title, start, end ⚠️ ใช้ปี 2026 เท่านั้น)
- `WORK_LOG`: บันทึกเวลาทำงาน (ต้องมี task, duration)
- `REMINDER`: ตั้งเวลาแจ้งเตือน (ต้องมี message, delay_minutes)
- `SCHEDULE_TASK`: ตั้ง Cron Job (ต้องมี name, schedule, task)

## ⚠️ กฎสำคัญ:
1. ทุก ACTION ต้องอยู่ในรูปแบบ `[ACTION: NAME {JSON}]`
2. ห้ามสร้างไฟล์ที่ไม่มีข้อมูลจริง
3. เมื่อค้นหาข้อมูล ให้รอผลก่อนแล้วค่อยสรุป
4. วันที่ต้องใช้ปี 2026 (ค.ศ.) หรือ 2569 (พ.ศ.) เสมอ
