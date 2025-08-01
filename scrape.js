import puppeteer from "puppeteer";
import fs from "fs";

(async () => {
    // 1. Mở trình duyệt
    const browser = await puppeteer.launch({
        headless: false,
        slowwmo: 500, // Giảm tốc độ để dễ quan sát
    });
    const page = await browser.newPage();
    console.log('mở trình duyệt');
    // 2. Mở Google
    await page.goto("https://mybk.hcmut.edu.vn/dkmh/dangKyMonHocForm.action");

    // 2. Nhập username
    await page.type("#username", "phuong.tran206");

    // 3. Nhập password
    await page.type("#password", "phuongphuongphuong");

    // 4. Click nút đăng nhập
    await page.click("input[type='submit']");

    //đăng nhập thủ công
    await page.waitForSelector(".content-wrapper")

    //tìm ô để bấm 
    await page.click(".table > tbody > tr:nth-child(3)");

    //Chờ trang tải xong
    await page.waitForSelector(".content-wrapper")
    //debug
    page.on("console", msg => {
    console.log("📜 Browser log:", msg.text());
    });

    await page.evaluate(() => {
    console.log("Hello from browser!");
    });
    //chờ có dữ liệu
    await page.waitForSelector(".panel-default", { timeout: 10000 });
    // lấy dữ liệu 
    const objects = await page.evaluate(() => {
        const panels = document.querySelectorAll(".panel-default");
        let result = [];

        panels.forEach(panel => {
            let classObj = {};
            classObj.class = {}; // Khởi tạo object class

            // Lấy mã và tên môn
            const titleText = panel.querySelector(".col-md-9")?.innerText.trim() || "";
            const [codeRaw, nameRaw] = titleText.split(" - ");
            classObj.code = codeRaw.trim();
            classObj.name = nameRaw?.trim() || "";

            // Lấy mã lớp (VD: L05)
            const classCode = panel.querySelector(".col-md-12 > table > tbody > tr:nth-child(2) > td.item_list:nth-child(1)")?.innerText.trim() || "";

            // Khởi tạo mảng cho lớp này
            classObj.class[classCode] = [];

            // Lấy các dòng lịch học
            const timeRows = panel.querySelectorAll(".table tr:not(.bg)");
            timeRows.forEach(row => {
                const cols = row.querySelectorAll("td");
                if (cols.length >= 6) {
                    const thuText = cols[0].innerText.trim();
                    const tietText = cols[1].innerText.trim();
                    const tuanText = cols[5].innerText.trim();

                    if (thuText && tietText && tuanText) {
                        // Chuyển "Thứ 6" → 6
                        const day = parseInt(thuText.match(/\d+/)?.[0] || "0");

                        // Chuyển "- - - - - - 7 8 9 - - - - - - -" → [7,8,9]
                        const lesson = tietText.split(/\s+/).filter(v => /^\d+$/.test(v)).map(Number);

                        // Chuyển "12345678-0123456--------------" → mảng tuần
                        let week = [];
                        tuanText.split("").forEach((char, index) => {
                            if (/\d/.test(char)) {
                                week.push(index + 1); // Tuần bắt đầu từ 1
                            }
                        });

                        // Thêm vào mảng lớp
                        classObj.class[classCode].push({
                            day,
                            lesson,
                            week
                        });
                    }
                }
            });

            result.push(classObj);
        });

        return result;
    });


    console.log('in kết quả');
    //console.log(JSON.stringify(objects, null, 2));
    //bấm nút đăng ký, hiệu chỉnh
    await page.click("#div-KetQuaDKViewResponse > div:nth-of-type(2) > button:nth-of-type(2)");

    //chờ hiển thị
    await page.waitForSelector("#txtMSMHSearch");
    //lặp qua các môn
    // Lặp qua từng môn tuần tự
    for (let i = 0; i < objects.length; i++) {
        const code = objects[i].code;

        console.log(`🔍 Đang xử lý môn ${code} (${i + 1}/${objects.length})`);

        // Nhập mã môn
        await page.waitForSelector("#txtMSMHSearch");
        await page.click("#txtMSMHSearch", { clickCount: 3 });
        await page.keyboard.press("Backspace");
        await page.type("#txtMSMHSearch", code, { delay: 50 });
        await page.keyboard.press("Enter");

        // Chờ cho đến khi bảng kết quả có chứa mã môn này
        await page.waitForFunction(
            (code) => {
                const cell = document.querySelector("#tblMonHocMoLop tbody tr:nth-of-type(2) td:nth-of-type(3)");
                return cell && cell.innerText.trim() === code;
            },
            {},
            code
        );

        // Click vào môn để mở bảng lớp
        await page.click("#tblMonHocMoLop tbody tr:nth-of-type(2)");

        // Chờ bảng .gridTable của môn này load xong
        await page.waitForFunction(() => {
            const table = document.querySelector(".gridTable");
            return table && table.querySelectorAll("tbody > tr").length > 0;
        });

        // Lấy dữ liệu lớp mới
        const newClasses = await page.evaluate(() => {
            const table = document.querySelector(".gridTable");
            if (!table) return {};

            const rows = table.querySelectorAll("tbody > tr");
            let result = {};

            for (let r = 0; r < rows.length; r++) {
                const firstCell = rows[r].querySelector("td.item_list");
                if (firstCell && firstCell.colSpan !== 9 && firstCell.innerText.trim() !== "") {
                    const classCode = firstCell.innerText.trim();

                    if (!/^L\d+$/i.test(classCode)) continue; // Chỉ lấy mã lớp bắt đầu bằng L

                    const dksiSo = rows[r].querySelector("td:nth-child(2)")?.innerText.trim() || "";
                    const [dk, siSo] = dksiSo.split("/").map(s => parseInt(s) || 0);
                    if (dk >= siSo) continue; // Bỏ lớp đầy

                    result[classCode] = [];

                    const scheduleRow = rows[r + 1];
                    const innerTable = scheduleRow?.querySelector(".table");
                    if (innerTable) {
                        const timeRows = innerTable.querySelectorAll("tr:not(:first-child)");
                        timeRows.forEach(tr => {
                            const tds = tr.querySelectorAll("td");
                            if (tds.length >= 6) {
                                const thuText = tds[0].innerText.trim();
                                const tietText = tds[1].innerText.trim();
                                const tuanText = tds[5].innerText.trim();

                                const day = parseInt(thuText.match(/\d+/)?.[0] || "0");
                                const lesson = tietText.split(/\s+/).filter(v => /^\d+$/.test(v)).map(Number);
                                let week = [];
                                tuanText.split("").forEach((char, index) => {
                                    if (/\d/.test(char)) week.push(index + 1);
                                });

                                result[classCode].push({ day, lesson, week });
                            }
                        });
                    }
                }
            }
            return result;
        });

        // Gộp lớp mới vào môn hiện tại
        for (const [classCode, schedule] of Object.entries(newClasses)) {
            if (!(classCode in objects[i].class)) {
                objects[i].class[classCode] = schedule;
            }
        }

        console.log(`✅ Đã thêm ${Object.keys(newClasses).length} lớp mới cho môn ${code}`);
    }
    console.log(JSON.stringify(objects, null, 2));

    //hàm kiểm tra xung đột
    function hasConflict(schedule1, schedule2) {
        for (const s1 of schedule1) {
            for (const s2 of schedule2) {
                if (s1.day === s2.day) {
                    // Kiểm tra trùng tiết
                    const lessonOverlap = s1.lesson.some(l => s2.lesson.includes(l));
                    if (lessonOverlap) {
                        // Kiểm tra trùng tuần
                        const weekOverlap = s1.week.some(w => s2.week.includes(w));
                        if (weekOverlap) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    //sinh tổ hợp
    function generateCombinations(subjects) {
        const results = [];

        function backtrack(index, currentCombo) {
            if (index === subjects.length) {
                results.push([...currentCombo]);
                return;
            }

            const subject = subjects[index];
            for (const [classCode, schedule] of Object.entries(subject.class)) {
                let conflict = false;
                for (const chosen of currentCombo) {
                    if (hasConflict(chosen.schedule, schedule)) {
                        conflict = true;
                        break;
                    }
                }
                if (!conflict) {
                    currentCombo.push({ code: subject.code, name: subject.name, classCode, schedule });
                    backtrack(index + 1, currentCombo);
                    currentCombo.pop();
                }
            }
        }

        backtrack(0, []);
        return results;
    }

    //render html
    function renderTable(combo) {
        const colors = ["#f4cccc", "#d9ead3", "#c9daf8", "#fff2cc", "#ead1dc", "#d0e0e3"];
        let html = `<table border="1" style="border-collapse:collapse;text-align:center;">
            <tr>
                <th>Tiết</th>
                <th>Thứ 2</th><th>Thứ 3</th><th>Thứ 4</th><th>Thứ 5</th><th>Thứ 6</th><th>Thứ 7</th><th>Thứ 8</th>
            </tr>`;

        for (let lesson = 1; lesson <= 15; lesson++) {
            html += `<tr><td>${lesson}</td>`;
            for (let day = 2; day <= 8; day++) {
                const entry = combo.find(c => c.schedule.some(s => s.day === day && s.lesson.includes(lesson)));
                if (entry) {
                    html += `<td style="background:${colors[combo.indexOf(entry) % colors.length]}">
                        ${entry.name}<br>${entry.classCode}
                    </td>`;
                } else {
                    html += `<td></td>`;
                }
            }
            html += `</tr>`;
        }

        html += `</table><br>`;
        return html;
    }
    //xuất file
    const combos = generateCombinations(objects);

    let htmlOutput = "<html><body>";
    combos.forEach(combo => {
        htmlOutput += renderTable(combo);
    });
    htmlOutput += "</body></html>";

    // Lưu file
    fs.writeFileSync("timetable.html", htmlOutput, "utf-8");
    console.log(`✅ Đã tạo ${combos.length} tổ hợp vào timetable.html`);

    fs.writeFileSync("output.json", JSON.stringify(objects, null, 4), "utf8");

    // console.log("✅ Đã tạo file output.html");
    await browser.close();
})();
