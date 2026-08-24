-- Initial factory-standard palette confirmed from the customer Miniapp's
-- horizontal/vertical real-bag photos. Composite SKU filenames such as
-- “焦糖米提” are decomposed into their bag-body and handle material colours.

WITH factory_colors(id, color_key, name) AS (
  VALUES
    ('SC-FACTORY-RED', 'factory-red', '红色'),
    ('SC-FACTORY-BLACK', 'factory-black', '黑色'),
    ('SC-FACTORY-WHITE', 'factory-white', '白色'),
    ('SC-FACTORY-DARK-GREEN', 'factory-dark-green', '墨绿'),
    ('SC-FACTORY-IVORY', 'factory-ivory', '米白'),
    ('SC-FACTORY-ROYAL-BLUE', 'factory-royal-blue', '宝蓝'),
    ('SC-FACTORY-YELLOW', 'factory-yellow', '黄色'),
    ('SC-FACTORY-GRAY', 'factory-gray', '灰色'),
    ('SC-FACTORY-PURPLE', 'factory-purple', '紫色'),
    ('SC-FACTORY-BRIGHT-GREEN', 'factory-bright-green', '亮绿'),
    ('SC-FACTORY-COFFEE', 'factory-coffee', '咖色'),
    ('SC-FACTORY-SKY-BLUE', 'factory-sky-blue', '天蓝'),
    ('SC-FACTORY-FRUIT-GREEN', 'factory-fruit-green', '果绿'),
    ('SC-FACTORY-ORANGE', 'factory-orange', '橘色'),
    ('SC-FACTORY-OCEAN-BLUE', 'factory-ocean-blue', '海蓝'),
    ('SC-FACTORY-ROSE', 'factory-rose', '玫红'),
    ('SC-FACTORY-GRASS-GREEN', 'factory-grass-green', '草绿'),
    ('SC-FACTORY-MATCHA-GREEN', 'factory-matcha-green', '抹茶绿'),
    ('SC-FACTORY-DENIM-BLUE', 'factory-denim-blue', '牛仔蓝'),
    ('SC-FACTORY-CORAL-PINK', 'factory-coral-pink', '珊瑚粉'),
    ('SC-FACTORY-ANGOLA-RED', 'factory-angola-red', '安哥拉红'),
    ('SC-FACTORY-KHAKI', 'factory-khaki', '卡其'),
    ('SC-FACTORY-TARO-PURPLE', 'factory-taro-purple', '香芋紫'),
    ('SC-FACTORY-OLIVE-GREEN', 'factory-olive-green', '橄榄绿'),
    ('SC-FACTORY-HAZE-BLUE', 'factory-haze-blue', '雾霾蓝'),
    ('SC-FACTORY-ICE-PLUM', 'factory-ice-plum', '冰梅'),
    ('SC-FACTORY-CHICK-YELLOW', 'factory-chick-yellow', '小鸡黄'),
    ('SC-FACTORY-LAKE-BLUE', 'factory-lake-blue', '湖蓝'),
    ('SC-FACTORY-CARAMEL', 'factory-caramel', '焦糖'),
    ('SC-FACTORY-PINK', 'factory-pink', '粉色'),
    ('SC-FACTORY-WINE-RED', 'factory-wine-red', '酒红'),
    ('SC-FACTORY-TARO-MUD-PURPLE', 'factory-taro-mud-purple', '芋泥紫'),
    ('SC-FACTORY-FLUORESCENT-GREEN', 'factory-fluorescent-green', '荧光绿'),
    ('SC-FACTORY-BEAN-GREEN', 'factory-bean-green', '豆绿'),
    ('SC-FACTORY-SAUCE-YELLOW', 'factory-sauce-yellow', '酱黄')
)
INSERT INTO standard_colors (id, color_key, name, enabled)
SELECT factory_colors.id, factory_colors.color_key, factory_colors.name, true
FROM factory_colors
WHERE NOT EXISTS (
  SELECT 1
  FROM standard_colors AS existing
  WHERE existing.name = factory_colors.name
)
ON CONFLICT DO NOTHING;

WITH legacy_aliases(id, alias, standard_name) AS (
  VALUES
    ('CA-FACTORY-LEGACY-WHITE', '本白', '白色'),
    ('CA-FACTORY-LEGACY-RED', '大红', '红色'),
    ('CA-FACTORY-LEGACY-ROYAL-BLUE', '宝兰', '宝蓝'),
    ('CA-FACTORY-LEGACY-SKY-BLUE', '天兰', '天蓝'),
    ('CA-FACTORY-LEGACY-ORANGE', '桔红', '橘色'),
    ('CA-FACTORY-LEGACY-IVORY', '米白色', '米白'),
    ('CA-FACTORY-LEGACY-CARAMEL', '焦糖色', '焦糖')
)
INSERT INTO color_aliases (id, alias, standard_color_id, source_type, source_id, enabled)
SELECT legacy_aliases.id, legacy_aliases.alias, standard_color.id, 'global', '', true
FROM legacy_aliases
JOIN LATERAL (
  SELECT id
  FROM standard_colors
  WHERE name = legacy_aliases.standard_name
  ORDER BY id
  LIMIT 1
) AS standard_color ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM color_aliases AS existing
  WHERE existing.alias = legacy_aliases.alias
    AND existing.source_type = 'global'
    AND COALESCE(existing.source_id, '') = ''
)
ON CONFLICT DO NOTHING;
