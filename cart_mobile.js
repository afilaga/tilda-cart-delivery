const CONFIG = {
  storageKey: 'tilda-cart',
  yandexApiKey: 'dbf82c7e-07e0-4f48-9d58-af79232f463e',
};

const MAP_CENTER = [43.585474, 39.723123];
const MAP_ZONES = [
  {
    id: 'zone-blue',
    name: 'Синяя зона',
    cost: 350,
    color: '#4C7DF0',
    coordinates: [
      [43.5935, 39.7090],
      [43.5935, 39.7320],
      [43.5790, 39.7320],
      [43.5790, 39.7090],
      [43.5935, 39.7090],
    ],
  },
  {
    id: 'zone-yellow',
    name: 'Жёлтая зона',
    cost: 500,
    color: '#F0B429',
    coordinates: [
      [43.6030, 39.6930],
      [43.6030, 39.7540],
      [43.5650, 39.7540],
      [43.5650, 39.6930],
      [43.6030, 39.6930],
    ],
  },
  {
    id: 'zone-red',
    name: 'Красная зона',
    cost: 700,
    color: '#E85D5D',
    coordinates: [
      [43.6170, 39.6700],
      [43.6170, 39.7860],
      [43.5450, 39.7860],
      [43.5450, 39.6700],
      [43.6170, 39.6700],
    ],
  },
];

const formatMoney = (value) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

const SELECTORS = {};

const MapController = {
  scriptPromise: null,
  instance: null,
  ready: false,
  selectedPolygon: null,

  loadScript() {
    if (window.ymaps) {
      return Promise.resolve();
    }
    if (this.scriptPromise) {
      return this.scriptPromise;
    }
    this.scriptPromise = new Promise((resolve, reject) => {
      const existing = document.getElementById('yandex-maps-script');
      if (existing) {
        existing.addEventListener('load', resolve);
        existing.addEventListener('error', () => reject(new Error('Не удалось загрузить Яндекс.Карты')));
        return;
      }

      const script = document.createElement('script');
      script.id = 'yandex-maps-script';
      script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${CONFIG.yandexApiKey}`;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Не удалось загрузить Яндекс.Карты'));
      document.head.appendChild(script);
    });
    return this.scriptPromise;
  },

  init() {
    if (this.instance || this.ready || !SELECTORS.deliveryMap) {
      return;
    }
    if (!window.ymaps) {
      return;
    }
    window.ymaps.ready(() => {
      if (this.instance || !SELECTORS.deliveryMap) {
        return;
      }

      this.ready = true;
      this.instance = new window.ymaps.Map('deliveryMap', {
        center: MAP_CENTER,
        zoom: 11,
        controls: ['zoomControl'],
      }, {
        suppressMapOpenBlock: true,
      });

      MAP_ZONES.forEach((zone) => {
        const polygon = new window.ymaps.Polygon([zone.coordinates], {
          hintContent: `${zone.name} — ${zone.cost} ₽`,
        }, {
          fillColor: MapController.hexToRgba(zone.color, 0.25),
          strokeColor: zone.color,
          strokeWidth: 2,
          fillOpacity: 0.8,
          cursor: 'pointer',
        });

        polygon.zoneMeta = zone;
        polygon.events.add('click', () => this.selectZone(zone, polygon));
        polygon.events.add('mouseenter', () => polygon.options.set('strokeWidth', 3));
        polygon.events.add('mouseleave', () => {
          if (this.selectedPolygon !== polygon) {
            polygon.options.set('strokeWidth', 2);
          }
        });

        this.instance.geoObjects.add(polygon);
      });

      if (SELECTORS.deliveryMapPlaceholder) {
        SELECTORS.deliveryMapPlaceholder.remove();
      }
    });
  },

  selectZone(zone, polygon) {
    CartState.setDeliveryZone(zone);
    if (this.selectedPolygon) {
      this.selectedPolygon.options.set('fillColor', MapController.hexToRgba(this.selectedPolygon.zoneMeta.color, 0.25));
      this.selectedPolygon.options.set('strokeWidth', 2);
    }
    this.selectedPolygon = polygon;
    polygon.options.set('fillColor', MapController.hexToRgba(zone.color, 0.45));
    polygon.options.set('strokeWidth', 3);
  },

  resetZone() {
    if (this.selectedPolygon) {
      this.selectedPolygon.options.set('fillColor', MapController.hexToRgba(this.selectedPolygon.zoneMeta.color, 0.25));
      this.selectedPolygon.options.set('strokeWidth', 2);
      this.selectedPolygon = null;
    }
    CartState.clearDeliveryZone();
  },

  hexToRgba(hex, alpha) {
    const match = hex.replace('#', '').match(/.{1,2}/g);
    if (!match) return `rgba(0,0,0,${alpha})`;
    const [r, g, b] = match.map((value) => parseInt(value, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },
};

const CartState = {
  items: [],
  deliveryCost: 0,
  deliveryZone: '',

  load() {
    try {
      const stored = JSON.parse(localStorage.getItem(CONFIG.storageKey));
      if (Array.isArray(stored)) {
        this.items = stored.map((item) => ({
          ...item,
          quantity: Number(item.quantity) || 1,
        }));
      }
    } catch (error) {
      console.warn('Cart load error:', error);
    }
  },

  save() {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(this.items));
  },

  add({ id, name, price }) {
    const existing = this.items.find((item) => item.id === id);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.items.push({
        id,
        name,
        price,
        quantity: 1,
      });
    }
    this.render();
  },

  changeQuantity(id, delta) {
    const item = this.items.find((product) => product.id === id);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
      this.items = this.items.filter((product) => product.id !== id);
    }
    this.render();
  },

  clear() {
    this.items = [];
    this.deliveryCost = 0;
    this.deliveryZone = '';
    this.render();
  },

  setDeliveryZone(zone) {
    this.deliveryCost = zone.cost;
    this.deliveryZone = zone.name;
    this.updateDeliveryInfo();
    this.updateTotals();
  },

  clearDeliveryZone() {
    this.deliveryCost = 0;
    this.deliveryZone = '';
    this.updateDeliveryInfo();
    this.updateTotals();
  },

  updateDeliveryInfo() {
    const isCourier = SELECTORS.deliveryMethod?.value !== 'pickup';
    if (SELECTORS.deliveryZoneInfo) {
      if (!isCourier) {
        SELECTORS.deliveryZoneInfo.textContent = 'Самовывоз: оплачивается только заказ.';
      } else if (this.deliveryZone) {
        SELECTORS.deliveryZoneInfo.textContent = `${this.deliveryZone}: доставка ${formatMoney(this.deliveryCost)}`;
      } else {
        SELECTORS.deliveryZoneInfo.textContent = 'Зона доставки не выбрана.';
      }
    }
    if (SELECTORS.deliveryCostLabel) {
      if (!isCourier) {
        SELECTORS.deliveryCostLabel.textContent = '0 ₽';
      } else {
        SELECTORS.deliveryCostLabel.textContent = this.deliveryZone
          ? formatMoney(this.deliveryCost)
          : 'Уточним при подтверждении';
      }
    }
  },

  subtotal() {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  },

  total() {
    return this.subtotal() + this.deliveryCost;
  },

  updateBadge() {
    if (!SELECTORS.cartCount) return;
    const totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
    SELECTORS.cartCount.textContent = totalItems;
  },

  updateTotals() {
    if (SELECTORS.orderSubtotal) {
      SELECTORS.orderSubtotal.textContent = formatMoney(this.subtotal());
    }
    if (SELECTORS.orderTotal) {
      SELECTORS.orderTotal.textContent = formatMoney(this.total());
    }
    this.updateDeliveryInfo();
    updateSubmitState();
  },

  render() {
    if (!SELECTORS.cartItems) return;
    if (!this.items.length) {
      SELECTORS.cartItems.innerHTML = '<div class="cart-empty">Добавьте блюда из меню — они появятся здесь.</div>';
      this.updateBadge();
      this.updateTotals();
      this.save();
      return;
    }

    const itemsMarkup = this.items.map((item) => `
      <div class="cart-item" data-id="${item.id}">
        <div class="item-info">
          <div class="item-name">${item.name}</div>
          <div class="item-price">${formatMoney(item.price)} × ${item.quantity} = ${formatMoney(item.price * item.quantity)}</div>
        </div>
        <div class="item-controls">
          <button class="quantity-btn" data-action="decrease" data-id="${item.id}" aria-label="Уменьшить количество">−</button>
          <span class="item-quantity">${item.quantity}</span>
          <button class="quantity-btn" data-action="increase" data-id="${item.id}" aria-label="Увеличить количество">+</button>
        </div>
      </div>
    `).join('');

    SELECTORS.cartItems.innerHTML = itemsMarkup;

    SELECTORS.cartItems.querySelectorAll('.quantity-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const { id, action } = button.dataset;
        this.changeQuantity(id, action === 'increase' ? 1 : -1);
      });
    });

    this.updateBadge();
    this.updateTotals();
    this.save();
  },
};

const openCart = () => {
  if (!SELECTORS.cartOverlay || !SELECTORS.cartContent) return;
  SELECTORS.cartOverlay.classList.add('active');
  SELECTORS.cartOverlay.setAttribute('aria-hidden', 'false');
  SELECTORS.cartButton?.setAttribute('aria-expanded', 'true');
  SELECTORS.body?.classList.add('cart-locked');
  requestAnimationFrame(() => SELECTORS.cartContent?.focus({ preventScroll: true }));
};

const closeCart = () => {
  if (!SELECTORS.cartOverlay) return;
  SELECTORS.cartOverlay.classList.remove('active');
  SELECTORS.cartOverlay.setAttribute('aria-hidden', 'true');
  SELECTORS.cartButton?.setAttribute('aria-expanded', 'false');
  SELECTORS.body?.classList.remove('cart-locked');
  SELECTORS.cartButton?.focus({ preventScroll: true });
};

const toggleDeliveryPanel = () => {
  if (!SELECTORS.deliveryPanel || !SELECTORS.deliveryToggle) return;
  const willOpen = !SELECTORS.deliveryPanel.classList.contains('open');
  SELECTORS.deliveryPanel.classList.toggle('open', willOpen);
  SELECTORS.deliveryPanel.setAttribute('aria-hidden', willOpen ? 'false' : 'true');
  SELECTORS.deliveryToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  SELECTORS.deliveryChevron?.classList.toggle('rotated', willOpen);

  if (willOpen) {
    MapController.loadScript()
      .then(() => MapController.init())
      .catch((error) => {
        if (SELECTORS.deliveryMapPlaceholder) {
          SELECTORS.deliveryMapPlaceholder.textContent = 'Не удалось загрузить карту. Попробуйте позже.';
        }
        console.warn(error);
      });
  }
};

const updateSubmitState = () => {
  if (!SELECTORS.submitOrder) return;
  const isValid = validateForm();
  SELECTORS.submitOrder.disabled = !isValid;
};

const validateForm = (showErrors = false) => {
  if (!SELECTORS.clientName || !SELECTORS.clientPhone || !SELECTORS.submitOrder) {
    return CartState.items.length > 0;
  }

  let valid = true;

  const nameFilled = SELECTORS.clientName.value.trim().length > 0;
  if (!nameFilled) {
    if (SELECTORS.nameError && (showErrors || SELECTORS.clientName.value.length > 0)) {
      SELECTORS.nameError.style.display = 'block';
    }
    valid = false;
  } else if (SELECTORS.nameError) {
    SELECTORS.nameError.style.display = 'none';
  }

  const phone = SELECTORS.clientPhone.value.trim();
  const phoneValid = /^7\d{10}$/.test(phone);
  if (!phoneValid) {
    if (SELECTORS.phoneError && (showErrors || SELECTORS.clientPhone.value.length > 1)) {
      SELECTORS.phoneError.style.display = 'block';
    }
    valid = false;
  } else if (SELECTORS.phoneError) {
    SELECTORS.phoneError.style.display = 'none';
  }

  if (SELECTORS.deliveryMethod?.value === 'courier') {
    const addressFilled = SELECTORS.clientAddress?.value.trim().length > 0;
    if (!addressFilled) {
      if (SELECTORS.addressError && (showErrors || SELECTORS.clientAddress.value.length > 0)) {
        SELECTORS.addressError.style.display = 'block';
      }
      valid = false;
    } else if (SELECTORS.addressError) {
      SELECTORS.addressError.style.display = 'none';
    }
  } else if (SELECTORS.addressError) {
    SELECTORS.addressError.style.display = 'none';
  }

  if (!CartState.items.length) {
    valid = false;
  }

  return valid;
};

const showConfirmation = () => {
  if (!validateForm(true)) {
    alert('Пожалуйста, заполните обязательные поля и добавьте товары в корзину.');
    return;
  }
  if (SELECTORS.confirmationModal) {
    SELECTORS.confirmationModal.classList.add('open');
    SELECTORS.confirmationModal.setAttribute('aria-hidden', 'false');
  }
};

const hideConfirmation = () => {
  if (SELECTORS.confirmationModal) {
    SELECTORS.confirmationModal.classList.remove('open');
    SELECTORS.confirmationModal.setAttribute('aria-hidden', 'true');
  }
};

const processOrder = () => {
  const orderPayload = {
    items: [...CartState.items],
    subtotal: CartState.subtotal(),
    deliveryCost: CartState.deliveryCost,
    deliveryZone: CartState.deliveryZone,
    total: CartState.total(),
    client: {
      name: SELECTORS.clientName?.value.trim() ?? '',
      phone: SELECTORS.clientPhone?.value.trim() ?? '',
      address: SELECTORS.deliveryMethod?.value === 'courier'
        ? (SELECTORS.clientAddress?.value.trim() ?? '')
        : 'Самовывоз',
      comment: SELECTORS.clientComment?.value.trim() ?? '',
      payment: document.querySelector('input[name="payment"]:checked')?.value ?? 'cash',
      deliveryMethod: SELECTORS.deliveryMethod?.value ?? 'courier',
    },
  };

  console.info('ORDER_PLACED_STUB', orderPayload);

  hideConfirmation();
  closeCart();
  CartState.clear();
  if (SELECTORS.clientName) SELECTORS.clientName.value = '';
  if (SELECTORS.clientPhone) SELECTORS.clientPhone.value = '7';
  if (SELECTORS.clientAddress) SELECTORS.clientAddress.value = '';
  if (SELECTORS.clientComment) SELECTORS.clientComment.value = '';
  if (SELECTORS.deliveryMethod) SELECTORS.deliveryMethod.value = 'courier';
  MapController.resetZone();
  alert('Спасибо! Заказ отправлен менеджеру (пока без интеграции).');
};

const handleAddToCartClick = (event) => {
  const addToCartButton = event.target.closest(
    '.js-store-prodbtn-addtocart, .t-store__btn-add-to-cart, .t-store__btn-addtocart, .t-store-prod__btn, .t-store__card__btn',
  );
  if (!addToCartButton) return;

  const card = addToCartButton.closest(
    '.js-store-proditem, .t-store__card, .t-store-prod, .t-store__card-wrapper',
  );
  if (!card) return;

  const productId = card.dataset.productid || card.id || Math.random().toString(36).slice(2, 11);
  const nameElement = card.querySelector(
    '.js-store-prodtitle, .t-store__prodtitle, .t-store__card__title, .t-store-prod__title, .t-title, .t-name',
  );
  const priceElement = card.querySelector(
    '.js-product-price, .t-store__price-value, .t-store__card__price, .t-store-prod__price, .t-price',
  );

  const name = nameElement ? nameElement.textContent.trim() : 'Товар';
  const priceText = priceElement ? priceElement.textContent.replace(/\s/g, '') : '0';
  const price = parseInt(priceText.replace(/[^\d]/g, ''), 10) || 0;

  CartState.add({ id: productId, name, price });
};

const enforcePhoneMask = (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  let digits = input.value.replace(/\D/g, '');
  if (!digits.startsWith('7')) {
    digits = `7${digits.replace(/^7/, '')}`;
  }
  digits = digits.slice(0, 11);
  input.value = digits;
};

const handleDeliveryMethodChange = () => {
  if (!SELECTORS.deliveryMethod) return;
  const isCourier = SELECTORS.deliveryMethod.value === 'courier';
  if (SELECTORS.addressField) {
    SELECTORS.addressField.style.display = isCourier ? 'flex' : 'none';
  }
  if (!isCourier) {
    MapController.resetZone();
  }
  CartState.updateTotals();
  updateSubmitState();
};

const attachGlobalListeners = () => {
  SELECTORS.cartButton?.addEventListener('click', openCart);
  SELECTORS.closeCart?.addEventListener('click', closeCart);
  SELECTORS.cartOverlay?.addEventListener('click', (event) => {
    if (event.target === SELECTORS.cartOverlay) {
      closeCart();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && SELECTORS.cartOverlay?.classList.contains('active')) {
      closeCart();
    }
  });

  SELECTORS.deliveryToggle?.addEventListener('click', toggleDeliveryPanel);
  SELECTORS.resetZoneBtn?.addEventListener('click', () => MapController.resetZone());

  SELECTORS.submitOrder?.addEventListener('click', showConfirmation);
  SELECTORS.confirmOrder?.addEventListener('click', processOrder);
  SELECTORS.cancelOrder?.addEventListener('click', hideConfirmation);

  SELECTORS.clientName?.addEventListener('input', () => updateSubmitState());
  SELECTORS.clientPhone?.addEventListener('input', (event) => {
    enforcePhoneMask(event);
    updateSubmitState();
  });
  SELECTORS.clientAddress?.addEventListener('input', () => updateSubmitState());
  SELECTORS.clientComment?.addEventListener('input', () => updateSubmitState());
  SELECTORS.deliveryMethod?.addEventListener('change', handleDeliveryMethodChange);

  document.addEventListener('click', handleAddToCartClick);

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length > 0)) {
      document.addEventListener('click', handleAddToCartClick, { once: true });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
};

const cacheSelectors = () => {
  SELECTORS.body = document.body;
  SELECTORS.cartButton = document.getElementById('cartBtn');
  SELECTORS.cartOverlay = document.getElementById('cartOverlay');
  SELECTORS.cartContent = document.getElementById('cartContent');
  SELECTORS.closeCart = document.getElementById('closeCart');
  SELECTORS.cartItems = document.getElementById('cartItems');
  SELECTORS.cartCount = document.getElementById('cartCount');
  SELECTORS.orderSubtotal = document.getElementById('orderSubtotal');
  SELECTORS.orderTotal = document.getElementById('orderTotal');
  SELECTORS.deliveryCostLabel = document.getElementById('deliveryCostLabel');
  SELECTORS.submitOrder = document.getElementById('submitOrder');
  SELECTORS.deliveryToggle = document.getElementById('deliveryToggle');
  SELECTORS.deliveryPanel = document.getElementById('deliveryPanel');
  SELECTORS.deliveryChevron = SELECTORS.deliveryToggle?.querySelector('.delivery-toggle__chevron');
  SELECTORS.deliveryMap = document.getElementById('deliveryMap');
  SELECTORS.deliveryMapPlaceholder = document.getElementById('deliveryMapPlaceholder');
  SELECTORS.deliveryZoneInfo = document.getElementById('deliveryZoneInfo');
  SELECTORS.resetZoneBtn = document.getElementById('resetZoneBtn');
  SELECTORS.addressField = document.getElementById('addressField');
  SELECTORS.clientName = document.getElementById('clientName');
  SELECTORS.clientPhone = document.getElementById('clientPhone');
  SELECTORS.clientAddress = document.getElementById('clientAddress');
  SELECTORS.clientComment = document.getElementById('clientComment');
  SELECTORS.deliveryMethod = document.getElementById('deliveryMethod');
  SELECTORS.nameError = document.getElementById('nameError');
  SELECTORS.phoneError = document.getElementById('phoneError');
  SELECTORS.addressError = document.getElementById('addressError');
  SELECTORS.confirmationModal = document.getElementById('confirmationModal');
  SELECTORS.confirmOrder = document.getElementById('confirmOrder');
  SELECTORS.cancelOrder = document.getElementById('cancelOrder');
};

const init = () => {
  cacheSelectors();
  if (!SELECTORS.cartButton || !SELECTORS.cartOverlay) {
    console.warn('Cart UI elements not found on the page.');
    return;
  }

  SELECTORS.cartContent?.setAttribute('tabindex', '-1');

  CartState.load();
  CartState.render();
  attachGlobalListeners();
  handleDeliveryMethodChange();
  updateSubmitState();
};

document.addEventListener('DOMContentLoaded', init);
