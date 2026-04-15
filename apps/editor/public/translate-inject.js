// translate-inject.js — DOM-based Chinese localization for the upstream editor
// Uses MutationObserver to translate text as it appears in the DOM
// This script is injected into the webview alongside the editor build

;(function () {
  'use strict'

  // ── Translation map (inlined for performance) ──
  const T = {
    'Scene': '场景', 'Property Line': '地块边界', 'Area': '面积', 'Perimeter': '周长',
    'Add point': '添加点', 'Upload scan/floorplan': '上传扫描图/平面图',
    'Building': '建筑', 'Level': '楼层', 'No levels yet': '暂无楼层',
    'Add level': '添加楼层', 'No buildings yet': '暂无建筑',
    'Camera snapshot': '相机快照', 'View snapshot': '查看快照',
    'Take snapshot': '拍摄快照', 'Update snapshot': '更新快照',
    'Clear snapshot': '清除快照', 'Delete': '删除',
    'The ground level cannot be deleted': '地面层不能删除',
    'No zones on this level': '此楼层无区域', 'Add one': '添加一个',
    'No elements on this level': '此楼层无元素',
    'Select a level to view content': '选择楼层查看内容',
    'Delete level': '删除楼层', 'Structure': '结构', 'Furnish': '装饰',
    'Zones': '区域', 'Cutaway': '剖切', 'Up': '向上', 'Down': '向下',
    'Manual': '手动', 'Stacked': '堆叠', 'Exploded': '爆炸视图', 'Solo': '单独',
    'Type a new name…': '输入新名称…', 'Type a new name above…': '在上面输入新名称…',
    'Camera Snapshot — Select Scope': '相机快照 — 选择范围',
    'Site': '场地', 'Selection': '选择', 'Wall Mode': '墙体模式',
    'Level Mode': '楼层模式', 'Rename Level': '重命名楼层', 'Go to Level': '转到楼层',
    'Wall': '墙体', 'Slab': '楼板', 'Ceiling': '天花板',
    'Gable Roof': '山墙屋顶', 'Stairs': '楼梯', 'Door': '门', 'Window': '窗户',
    'Fence': '围栏', 'Zone': '区域', 'Furniture': '家具', 'Appliance': '电器',
    'Kitchen': '厨房', 'Bathroom': '浴室', 'Outdoor': '户外',
    'navigate': '导航', 'select': '选择', 'back': '返回', 'close': '关闭',
    'Send Feedback': '发送反馈',
    'We\'d love to hear your thoughts': '我们很乐意听取您的想法',
    'Thanks for your feedback!': '感谢您的反馈！',
    'Your feedback': '您的反馈',
    'Share your thoughts, suggestions, feature requests, or report issues...': '分享您的想法、建议、功能请求或报告问题...',
    'Drop images here': '拖放图片到这里', 'Cancel': '取消', 'Sending...': '发送中...',
    'Attach': '添加附件', 'Length': '长度', 'Height': '高度', 'Width': '宽度',
    'Thickness': '厚度', 'Depth': '深度', 'Rotation': '旋转', 'Position': '位置',
    'Dimensions': '尺寸', 'Material': '材质', 'White': '白色', 'Brick': '砖块',
    'Concrete': '混凝土', 'Wood': '木材', 'Glass': '玻璃', 'Metal': '金属',
    'Plaster': '石膏', 'Tile': '瓷砖', 'Marble': '大理石', 'Custom': '自定义',
    'Color': '颜色', 'Roughness': '粗糙度', 'Metalness': '金属度',
    'Opacity': '不透明度', 'Side': '面', 'Front': '正面', 'Back': '背面',
    'Double': '双面', 'Feedback': '反馈', 'Move': '移动', 'Duplicate': '复制',
    'Cut Out': '切割', 'Add': '添加', 'Remove': '移除', 'Done': '完成',
    'Orbit Left': '向左旋转', 'Orbit Right': '向右旋转', 'Top View': '俯视图',
    'Clear selection': '清除选择', 'Add level above': '在上方添加楼层',
    'Add level below': '在下方添加楼层', 'Insert level here': '在此处插入楼层',
    'Are you sure you want to delete': '确定要删除吗',
    'All walls, floors, and objects on this level will be permanently removed': '此楼层上的所有墙体、地板和物体将被永久删除',
    'Info': '信息', 'Holes': '孔洞', 'Style': '样式', 'Footprint': '轮廓',
    'Heights': '高度', 'Roof Type': '屋顶类型', 'Segments': '分段',
    'Actions': '操作', 'Grid': '网格', 'Frame': '框架', 'Sill': '窗台',
    'Hardware': '五金', 'Swing': '开启方向', 'Content Padding': '内容内边距',
    'Threshold': '门槛', 'Handle': '把手', 'Bar': '栏杆',
    'Enable Threshold': '启用门槛', 'Enable Handle': '启用把手',
    'Enable Sill': '启用窗台', 'Door Closer': '门闭器', 'Panic Bar': '恐慌杆',
    'Flip Side': '翻转侧边', 'Horizontal': '水平', 'Vertical': '垂直',
    'Add flight': '添加梯段', 'Add landing': '添加平台', 'Rise': '踏步高',
    'Steps': '踏步数', 'Fit To Floor': '适配地板', 'Inner Radius': '内半径',
    'Sweep': '扫描角度', 'Top Landing': '顶部平台', 'Center Column': '中心柱',
    'Step Supports': '踏步支撑', 'Columns': '列数', 'Post Spacing': '立柱间距',
    'Post Size': '立柱尺寸', 'Ground Clear': '离地间隙', 'Edge Inset': '边缘内缩',
    'Base Height': '基座高度', 'Top Rail': '顶部栏杆', 'Scale': '缩放',
    'Elevation': '标高', 'Collections': '集合', 'Manage collections…': '管理集合…',
    'New': '新建', 'Manage collections': '管理集合', 'Rename': '重命名',
    'No collections yet. Create one to group items together.': '暂无集合。创建一个来分组项目。',
    'Wall Tool': '墙体工具', 'Slab Tool': '楼板工具', 'Ceiling Tool': '天花板工具',
    'Door Tool': '门工具', 'Window Tool': '窗工具', 'Item Tool': '物品工具',
    'Stair Tool': '楼梯工具', 'Zone Tool': '区域工具', 'Delete Selection': '删除选中',
    'Add Level': '添加楼层',
    'Camera: Switch to Orthographic': '相机：切换到正交视图',
    'Camera: Switch to Perspective': '相机：切换到透视图',
    'Switch to Light Theme': '切换到浅色主题', 'Switch to Dark Theme': '切换到深色主题',
    'Exit Preview': '退出预览', 'Enter Preview': '进入预览',
    'Toggle Fullscreen': '切换全屏', 'Undo': '撤销', 'Redo': '重做',
    'No commands found.': '未找到命令。', 'Search actions...': '搜索操作...',
    'Filter options...': '筛选选项...',
    'Something went wrong': '出错了', 'Try again': '重试',
    'Export Scene (JSON)': '导出场景 (JSON)', 'Export 3D Model (GLB)': '导出 3D 模型 (GLB)',
    'Copy Share Link': '复制分享链接', 'Take Screenshot': '截图',
    // Catalog items
    'Pillar': '柱子', 'High Fence': '高栅栏', 'Medium Fence': '中栅栏',
    'Low Fence': '低栅栏', 'Bush': '灌木', 'Fir': '冷杉', 'Tree': '树',
    'Palm': '棕榈树', 'Patio Umbrella': '露台伞', 'Sunbed': '日光浴床',
    'Double Window': '双窗', 'Simple Window': '简单窗', 'Rectangle Window': '矩形窗',
    'Door with bar': '带杆门', 'Glass Door': '玻璃门', 'Parking Spot': '停车位',
    'Toilet Paper': '卫生纸', 'Shower Rug': '淋浴垫', 'Laundry Bag': '洗衣袋',
    'Drying Rack': '晾衣架', 'Washing Machine': '洗衣机', 'Toilet': '马桶',
    'Squared Shower': '方形淋浴', 'Angle Shower': '角形淋浴', 'Bathtub': '浴缸',
    'Bathroom Sink': '洗手盆', 'Ceiling fan': '吊扇', 'Electric Panel': '电箱',
    'Sprinkler': '喷头', 'Smoke Detector': '烟雾探测器', 'Fire Detector': '火灾探测器',
    'Exit Sign': '出口标志', 'Hydrant': '消防栓', 'Thermostat': '恒温器',
    'Air Conditioning': '空调', 'Toaster': '烤面包机', 'Kettle': '水壶',
    'Coffee Machine': '咖啡机', 'Television': '电视', 'Computer': '电脑',
    'Stereo Speaker': '音响', 'Toy': '玩具', 'Guitar': '吉他', 'Piano': '钢琴',
    'Round Carpet': '圆形地毯', 'Rectangular Carpet': '矩形地毯', 'Cactus': '仙人掌',
    'Small Plant': '小盆栽', 'Indoor Plant': '室内植物',
    'Ironing Board': '烫衣板', 'Coat Rack': '衣架', 'Trash Bin': '垃圾桶',
    'Rounded Mirror': '圆形镜子', 'Picture': '画', 'Books': '书', 'Column': '柱子',
    'TV Stand': '电视柜', 'Shelf': '架子', 'Bookshelf': '书架',
    'Ceiling Lamp': '吊灯', 'Recessed Light': '筒灯', 'Floor Lamp': '落地灯',
    'Table Lamp': '台灯', 'Closet': '衣柜', 'Dresser': '梳妆台',
    'Bunkbed': '双层床', 'Double Bed': '双人床', 'Single Bed': '单人床',
    'Sofa': '沙发', 'Lounge Chair': '躺椅', 'Stool': '凳子',
    'Dining Chair': '餐椅', 'Office Chair': '办公椅', 'Livingroom Chair': '客厅椅',
    'Bedside Table': '床头柜', 'Coffee Table': '咖啡桌',
    'Office Table': '办公桌', 'Dining Table': '餐桌',
    'Microwave': '微波炉', 'Stove': '炉灶', 'Fridge': '冰箱',
    'Hood': '抽油烟机', 'Kitchen Shelf': '厨房架',
    'Kitchen Counter': '厨房台面', 'Kitchen Cabinet': '厨房柜',

    // ── Toolbar & view modes ──
    'Split': '分屏', 'Walkthrough': '漫游', 'Preview mode': '预览模式',
    'Perspective': '透视', 'Orthographic': '正交', 'Metric (m)': '公制 (m)',
    'Imperial (ft)': '英制 (ft)', 'Dark': '深色', 'Light': '浅色',
    'Collapse sidebar': '收起侧边栏', 'Expand sidebar': '展开侧边栏',
    'Toggle Sidebar': '切换侧边栏',

    // ── Cutaway modes ──
    'Full height': '全高', 'Full Height': '全高', 'Low': '低',

    // ── Editor overlay labels ──
    'The editor scene failed to render': '编辑器场景渲染失败',
    'You can retry the scene or return home without reloading the whole app shell.': '您可以重试场景或返回主页，无需重新加载整个应用。',
    'Reload editor': '重新加载编辑器', 'Back to home': '返回主页',
    'Pan': '平移', 'Rotate': '旋转', 'Zoom': '缩放',
    'Scroll wheel': '滚轮', 'Dismiss': '关闭',

    // ── Control modes ──
    'Select': '选择', 'Box select': '框选', 'Edit site': '编辑场地', 'Build': '构建',

    // ── First person ──
    'Exit Street View': '退出街景', 'Sprint': '冲刺',
    'Click to look around': '点击环顾四周',

    // ── View toggles ──
    'Guide images': '引导图', 'No guide images on this level yet.': '此楼层暂无引导图。',
    'No scans on this level yet.': '此楼层暂无扫描。',
    'Visible': '显示', 'Hidden': '隐藏',
    'Guides: Visible': '引导图：显示', 'Guides: Hidden': '引导图：隐藏',
    'Scans: Visible': '扫描：显示', 'Scans: Hidden': '扫描：隐藏',

    // ── Settings panel ──
    'Settings': '设置', 'Visibility': '可见性', 'Public': '公开',
    'Only you': '仅自己', 'can view': '可以查看',
    'Show 3D Scans': '显示 3D 扫描', 'Visible to public viewers': '对公开查看者可见',
    'Show Floorplans': '显示平面图', 'Show Grid': '显示网格',
    'Visible only in the editor': '仅在编辑器中可见',
    'Export': '导出', 'Export GLB': '导出 GLB', 'Export STL': '导出 STL', 'Export OBJ': '导出 OBJ',
    'Thumbnail': '缩略图', 'Generating...': '生成中...', 'Generate Thumbnail': '生成缩略图',
    'Save & Load': '保存与加载', 'Save Build': '保存建筑', 'Load Build': '加载建筑',
    'Audio': '音频', 'Keyboard': '键盘',
    'Scene Graph': '场景图', 'Explore scene graph': '浏览场景图',
    'Danger Zone': '危险区域', 'Clear & Start New': '清除并新建',

    // ── Audio settings ──
    'Audio Settings': '音频设置', 'Adjust volume levels and mute settings': '调整音量和静音设置',
    'Master Volume': '主音量', 'Radio Volume': '电台音量', 'Sound Effects': '音效',
    'Mute All Sounds': '全部静音', 'Unmute All Sounds': '取消全部静音',

    // ── Keyboard shortcuts dialog ──
    'Keyboard Shortcuts': '键盘快捷键',
    'Shortcuts are context-aware and depend on the current phase or tool.': '快捷键根据当前阶段或工具自动切换。',
    'Editor Navigation': '编辑器导航', 'Switch to Site phase': '切换到场地阶段',
    'Switch to Structure phase': '切换到结构阶段', 'Switch to Furnish phase': '切换到装饰阶段',
    'Switch to Structure layer': '切换到结构层', 'Switch to Furnish layer': '切换到装饰层',
    'Switch to Zones layer': '切换到区域层',
    'Select next level in the active building': '选择当前建筑的下一个楼层',
    'Select previous level in the active building': '选择当前建筑的上一个楼层',
    'toggle sidebar': '切换侧边栏',
    'Modes & History': '模式与历史', 'Switch to Select mode': '切换到选择模式',
    'Switch to Build mode': '切换到构建模式',
    'Cancel the active tool and return to Select mode': '取消当前工具并返回选择模式',
    'Delete selected objects': '删除所选对象',
    'Add or remove an object from multi-selection': '从多选中添加或移除对象',
    'Drawing Tools': '绘图工具',
    'Temporarily disable angle snapping while drawing walls, slabs, and ceilings': '绘制墙体、楼板和天花板时临时禁用角度吸附',
    'Item Placement': '物品放置',
    'Rotate item clockwise by 90 degrees': '顺时针旋转物品 90 度',
    'Rotate item counter-clockwise by 90 degrees': '逆时针旋转物品 90 度',
    'Temporarily bypass placement validation constraints': '临时绕过放置验证约束',
    'Pan camera': '平移相机', 'Orbit camera': '旋转相机',

    // ── Door panel ──
    'Hinges Side': '铰链侧', 'Direction': '方向',
    'Inward': '向内', 'Outward': '向外',
    'Handle Side': '把手侧', 'Bar Height': '横杆高度',
    'Panel': '面板', 'Empty': '空心',
    'Presets': '预设', '+ Add Segment': '+ 添加段', '- Remove': '- 移除', 'Inset': '内缩',

    // ── Fence panel ──
    'Slat': '板条', 'Rail': '横栏', 'Privacy': '隐私',
    'Grounded': '落地', 'Floating': '悬浮',

    // ── Stair panel ──
    'Staircase': '楼梯', 'Straight': '直梯', 'Curved': '弧形梯', 'Spiral': '螺旋梯',
    'Geometry': '几何', 'Fill to floor': '填充到地板', 'Uniform Scale': '等比缩放',
    'Stair Segment': '楼梯段', 'Flight': '梯段', 'Landing': '平台',
    'Attachment': '连接侧', 'Add Segment': '添加段',

    // ── Roof types ──
    'Hip': '四坡', 'Gable': '山墙', 'Shed': '单坡', 'Flat': '平顶',
    'Gambrel': '折线', 'Dutch': '荷兰式', 'Mansard': '折坡',
    'Roof Segment': '屋顶段',

    // ── Slab panel ──
    'Sunken (-15cm)': '下沉 (-15cm)', 'Ground (0m)': '地面 (0m)',
    'Raised (+5cm)': '抬高 (+5cm)', 'Step (+15cm)': '台阶 (+15cm)',
    'No holes': '无孔洞', 'Add Hole': '添加孔洞',
    '(Editing)': '(编辑中)', 'Hole ': '孔洞 ', ' pts': ' 点',

    // ── Window panel ──
    'Columns': '列数', 'Rows': '行数', 'Col Widths': '列宽',
    'Row Heights': '行高', 'Divider': '分隔条',

    // ── Zone panel ──
    'Select a level to view and create zones': '选择楼层以查看和创建区域',

    // ── Reference panel ──
    '3D Scan': '3D 扫描', 'Guide Image': '引导图',
    'Scale & Opacity': '缩放与不透明度',

    // ── Presets popover ──
    'Save new': '新建保存', 'Community': '社区', 'My presets': '我的预设',
    'No community presets yet.': '暂无社区预设。',
    'No presets saved yet. Use "Save new" to save the current configuration.': '暂无保存的预设。使用"新建保存"保存当前配置。',
    'Sign in to save and view your presets.': '登录以保存和查看您的预设。',
    'Update with current': '用当前配置更新', 'Remove from community': '从社区移除',
    'Share with community': '分享到社区', 'Preset name…': '预设名称…',

    // ── Collections popover ──
    'Collection name…': '集合名称…',

    // ── Command palette categories ──
    'Viewer Controls': '查看器控制', 'View': '视图', 'History': '历史',
    'Snapshot': '快照',

    // ── Helper tooltips ──
    'Set wall start / end': '设置墙体起点/终点',
    'Allow non-45° angles': '允许非 45° 角度',
    'Set corner': '设置角点', 'Place item': '放置物品',
    'Rotate counterclockwise': '逆时针旋转', 'Rotate clockwise': '顺时针旋转',
    'Free place': '自由放置', 'Place building': '放置建筑',

    // ── Scene / loading labels ──
    'Item': '物品', 'Roof Segment': '屋顶段',
    'Levels': '楼层', 'Untitled': '未命名',

    // ── Wall numbering (regex-based) ──
    // These are handled by the translateText function
  }

  // ── Attributes to translate ──
  const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label']

  // ── Skip translating these elements ──
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'CANVAS'])

  // ── Skip SVG namespace entirely — the 2D floorplan is all SVG ──
  // SVG text labels (measurements, wall lengths, zone names) must NOT be modified
  const SVG_TAGS = new Set([
    'svg', 'g', 'path', 'rect', 'circle', 'line', 'polygon', 'polyline',
    'text', 'tspan', 'image', 'defs', 'clippath', 'use', 'foreignobject',
    'lineargradient', 'radialgradient', 'stop', 'pattern', 'mask', 'symbol',
    'marker', 'desc', 'title', 'ellipse',
  ])

  // ── Cache: track already-translated nodes to avoid re-processing ──
  const translatedNodes = new WeakSet()

  // ── Translate a text string ──
  function translateText(text) {
    if (!text) return text
    const trimmed = text.trim()
    if (!trimmed) return text

    // Direct match
    if (T[trimmed]) {
      return text.replace(trimmed, T[trimmed])
    }

    // Pattern: "Level 1", "Level 2" → "层 1", "层 2"
    const levelMatch = trimmed.match(/^Level\s+(\d+)$/)
    if (levelMatch) {
      return text.replace(trimmed, `层 ${levelMatch[1]}`)
    }

    // Pattern: "Wall 1", "Wall 12" → "墙体 1", "墙体 12"
    const wallMatch = trimmed.match(/^Wall\s+(\d+(-\d+)?)$/)
    if (wallMatch) {
      return text.replace(trimmed, `墙体 ${wallMatch[1]}`)
    }

    // Pattern: "Slab 1", "Roof 1", etc. — numbered element labels
    const elementMatch = trimmed.match(/^(Slab|Ceiling|Door|Window|Fence|Stair|Item|Zone|Roof)\s+(\d+(-\d+)?)$/)
    if (elementMatch) {
      const typeMap = { Slab: '楼板', Ceiling: '天花板', Door: '门', Window: '窗', Fence: '围栏', Stair: '楼梯', Item: '物品', Zone: '区域', Roof: '屋顶' }
      const translated = typeMap[elementMatch[1]] || elementMatch[1]
      return text.replace(trimmed, `${translated} ${elementMatch[2]}`)
    }

    // Pattern: "Building 1" → "建筑 1"
    const buildingMatch = trimmed.match(/^Building\s+(\d+)$/)
    if (buildingMatch) {
      return text.replace(trimmed, `建筑 ${buildingMatch[1]}`)
    }

    // Case-insensitive fallback — try matching lowercase version
    const lowerKey = trimmed.toLowerCase()
    for (const [en, zh] of Object.entries(T)) {
      if (en.toLowerCase() === lowerKey) {
        return text.replace(trimmed, zh)
      }
    }

    return text
  }

  // ── Check if an element is inside an SVG context ──
  function isInSVG(el) {
    if (SVG_TAGS.has(el.tagName.toLowerCase())) return true
    // Check if it's an SVGElement instance (covers all SVG elements)
    if (el instanceof SVGElement) return true
    return false
  }

  // ── Translate an element's text content ──
  function translateElement(el) {
    if (translatedNodes.has(el)) return
    if (SKIP_TAGS.has(el.tagName)) return
    // CRITICAL: Skip all SVG elements — 2D floorplan is entirely SVG-based
    if (isInSVG(el)) return

    // Translate text nodes
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const translated = translateText(node.textContent)
        if (translated !== node.textContent) {
          node.textContent = translated
        }
      }
    }

    // Translate attributes
    for (const attr of TRANSLATABLE_ATTRS) {
      const val = el.getAttribute(attr)
      if (val) {
        const translated = translateText(val)
        if (translated !== val) {
          el.setAttribute(attr, translated)
        }
      }
    }

    translatedNodes.add(el)
  }

  // ── Process all existing DOM content ──
  function translateDocument() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
    )
    let node
    while ((node = walker.nextNode())) {
      translateElement(node)
    }
  }

  // ── Watch for DOM changes and translate new content ──
  function startObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Skip SVG mutations entirely for performance
        if (mutation.target instanceof SVGElement) continue
        // Handle added nodes
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            translateElement(node)
            // Also translate children
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT)
            let child
            while ((child = walker.nextNode())) {
              translateElement(child)
            }
          }
        }

        // Handle text changes
        if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement
          if (parent && !SKIP_TAGS.has(parent.tagName)) {
            translatedNodes.delete(parent)
            translateElement(parent)
          }
        }

        // Handle attribute changes
        if (mutation.type === 'attributes') {
          const target = mutation.target
          if (target.nodeType === Node.ELEMENT_NODE) {
            const attrName = mutation.attributeName
            if (TRANSLATABLE_ATTRS.includes(attrName)) {
              const val = target.getAttribute(attrName)
              if (val) {
                const translated = translateText(val)
                if (translated !== val) {
                  target.setAttribute(attrName, translated)
                }
              }
            }
          }
        }
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRS,
    })
  }

  // ── Initialize ──
  function init() {
    console.log('[FindTop i18n] Starting Chinese localization')

    // Initial pass — translate any text already in DOM
    if (document.body) {
      translateDocument()
    }

    // Start observing — only watch for newly added nodes (don't re-scan whole DOM)
    startObserver()
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
