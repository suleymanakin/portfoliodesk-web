-- Yatırımcı paneli KPI gösterim alanları (hesaplamada kullanılmaz; yalnızca UI).
ALTER TABLE "investors" ADD COLUMN "dashboard_display_anapara" DECIMAL(20,10),
ADD COLUMN "dashboard_display_entry_date" DATE;
