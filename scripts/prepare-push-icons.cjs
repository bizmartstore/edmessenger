const fs = require("fs");
const sharp = require("sharp");

async function main() {
  const src =
    "C:/Users/ASUS/.cursor/projects/c-Users-ASUS-dyad-apps-edmessenger/assets/c__Users_ASUS_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_ChatGPT_Image_Jul_26__2026__11_15_34_PM-1a09f053-0bd8-45ab-b2e4-9305eb4285c4.png";

  fs.mkdirSync("public/icons", { recursive: true });

  // Square 512 color logo for push
  await sharp(src)
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile("public/logo-push.png");

  // Square 256 push icon
  await sharp(src)
    .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile("public/icons/push-icon.png");

  // Monochrome badge for Android status bar (white silhouette on transparent)
  const { data, info } = await sharp(src)
    .resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    const on = a > 40 ? 255 : 0;
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = on;
  }

  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile("public/icons/notif-badge.png");

  console.log("push icons ready", {
    logo: fs.statSync("public/logo-push.png").size,
    icon: fs.statSync("public/icons/push-icon.png").size,
    badge: fs.statSync("public/icons/notif-badge.png").size,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
