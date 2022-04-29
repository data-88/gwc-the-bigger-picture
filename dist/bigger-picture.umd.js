(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.BiggerPicture = factory());
})(this, (function () {
    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    let src_url_equal_anchor;
    function src_url_equal(element_src, url) {
        if (!src_url_equal_anchor) {
            src_url_equal_anchor = document.createElement('a');
        }
        src_url_equal_anchor.href = url;
        return element_src === src_url_equal_anchor.href;
    }
    function not_equal(a, b) {
        return a != a ? b == b : a !== b;
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function set_store_value(store, ret, value) {
        store.set(value);
        return ret;
    }
    function action_destroyer(action_result) {
        return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
    }
    let now = () => window.performance.now()
        ;
    let raf = cb => requestAnimationFrame(cb) ;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function append_empty_stylesheet(node) {
        const style_element = element('style');
        append_stylesheet(document, style_element);
        return style_element.sheet;
    }
    function append_stylesheet(node, style) {
        append(node.head || node, style);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_style(node, key, value, important) {
        if (value === null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail, bubbles = false) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, false, detail);
        return e;
    }

    // we need to store the information for multiple documents because a Svelte application could also contain iframes
    // https://github.com/sveltejs/svelte/issues/3624
    const managed_styles = new Map();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_style_information(doc, node) {
        const info = { stylesheet: append_empty_stylesheet(), rules: {} };
        managed_styles.set(doc, info);
        return info;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = document;
        const { stylesheet, rules } = managed_styles.get(doc) || create_style_information(doc);
        if (!rules[name]) {
            rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            managed_styles.forEach(info => {
                const { stylesheet } = info;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                info.rules = {};
            });
            managed_styles.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                started = true;
                delete_rule(node);
                if (is_function(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_out_transition(node, fn, params) {
        let config = fn(node, params);
        let running = true;
        let animation_name;
        const group = outros;
        group.r += 1;
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            add_render_callback(() => dispatch(node, false, 'start'));
            loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(0, 1);
                        dispatch(node, false, 'end');
                        if (!--group.r) {
                            // this will result in `end()` being called,
                            // so we don't need to clean up here
                            run_all(group.c);
                        }
                        return false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(1 - t, t);
                    }
                }
                return running;
            });
        }
        if (is_function(config)) {
            wait().then(() => {
                // @ts-ignore
                config = config();
                go();
            });
        }
        else {
            go();
        }
        return {
            end(reset) {
                if (reset && config.tick) {
                    config.tick(1, 0);
                }
                if (running) {
                    if (animation_name)
                        delete_rule(node, animation_name);
                    running = false;
                }
            }
        };
    }
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = (program.b - t);
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program || pending_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: {},
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: {},
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function fade(node, { delay = 0, duration = 400, easing = identity } = {}) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 } = {}) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = new Set();
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (const subscriber of subscribers) {
                        subscriber[1]();
                        subscriber_queue.push(subscriber, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.add(subscriber);
            if (subscribers.size === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                subscribers.delete(subscriber);
                if (subscribers.size === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    function get_interpolator(a, b) {
        if (a === b || a !== a)
            return () => a;
        const type = typeof a;
        if (Array.isArray(a)) {
            const arr = b.map((bi, i) => {
                return get_interpolator(a[i], bi);
            });
            return t => arr.map(fn => fn(t));
        }
        if (type === 'number') {
            const delta = b - a;
            return t => a + t * delta;
        }
        
    }
    function tweened(value, defaults = {}) {
        const store = writable(value);
        let task;
        let target_value = value;
        function set(new_value, opts) {
            if (value == null) {
                store.set(value = new_value);
                return Promise.resolve();
            }
            target_value = new_value;
            let previous_task = task;
            let started = false;
            let { delay = 0, duration = 400, easing = identity, interpolate = get_interpolator } = assign(assign({}, defaults), opts);
            if (duration === 0) {
                if (previous_task) {
                    previous_task.abort();
                    previous_task = null;
                }
                store.set(value = target_value);
                return Promise.resolve();
            }
            const start = now() + delay;
            let fn;
            task = loop(now => {
                if (now < start)
                    return true;
                if (!started) {
                    fn = interpolate(value, new_value);
                    if (typeof duration === 'function')
                        duration = duration(value, new_value);
                    started = true;
                }
                if (previous_task) {
                    previous_task.abort();
                    previous_task = null;
                }
                const elapsed = now - start;
                if (elapsed > duration) {
                    store.set(value = new_value);
                    return false;
                }
                // @ts-ignore
                store.set(value = fn(easing(elapsed / duration)));
                return true;
            });
            return task.promise;
        }
        return {
            set,
            update: (fn, opts) => set(fn(target_value, value), opts),
            subscribe: store.subscribe
        };
    }

    const closing = writable(0);
    const zoomed = writable(0);

    // store if user prefers reduced motion
    const prefersReducedMotion = matchMedia(
    	'(prefers-reduced-motion: reduce)'
    ).matches;

    /* src/components/loading.svelte generated by Svelte v3.47.0 */

    function create_if_block$2(ctx) {
    	let div;
    	let div_intro;
    	let div_outro;
    	let current;
    	let if_block = !/*$closing*/ ctx[2] && create_if_block_1$2();

    	return {
    		c() {
    			div = element("div");
    			if (if_block) if_block.c();
    			attr(div, "class", "bp-load");
    			set_style(div, "background-image", "url(" + /*thumb*/ ctx[0] + ")");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (!/*$closing*/ ctx[2]) {
    				if (if_block) ; else {
    					if_block = create_if_block_1$2();
    					if_block.c();
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (!current || dirty & /*thumb*/ 1) {
    				set_style(div, "background-image", "url(" + /*thumb*/ ctx[0] + ")");
    			}
    		},
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (div_outro) div_outro.end(1);
    				div_intro = create_in_transition(div, fade, { duration: /*loaded*/ ctx[1] ? 300 : 0 });
    				div_intro.start();
    			});

    			current = true;
    		},
    		o(local) {
    			if (div_intro) div_intro.invalidate();

    			if (local) {
    				div_outro = create_out_transition(div, fade, { duration: 200 });
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			if (detaching && div_outro) div_outro.end();
    		}
    	};
    }

    // (12:2) {#if !$closing}
    function create_if_block_1$2(ctx) {
    	let span0;
    	let span1;

    	return {
    		c() {
    			span0 = element("span");
    			span1 = element("span");
    			attr(span0, "class", "bp-bar");
    			attr(span1, "class", "bp-o");
    		},
    		m(target, anchor) {
    			insert(target, span0, anchor);
    			insert(target, span1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span0);
    			if (detaching) detach(span1);
    		}
    	};
    }

    function create_fragment$4(ctx) {
    	let if_block_anchor;
    	let if_block = (!/*loaded*/ ctx[1] || /*$closing*/ ctx[2]) && create_if_block$2(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (!/*loaded*/ ctx[1] || /*$closing*/ ctx[2]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*loaded, $closing*/ 6) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$2(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			transition_in(if_block);
    		},
    		o(local) {
    			transition_out(if_block);
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let $closing;
    	component_subscribe($$self, closing, $$value => $$invalidate(2, $closing = $$value));
    	let { thumb } = $$props;
    	let { loaded } = $$props;

    	$$self.$$set = $$props => {
    		if ('thumb' in $$props) $$invalidate(0, thumb = $$props.thumb);
    		if ('loaded' in $$props) $$invalidate(1, loaded = $$props.loaded);
    	};

    	return [thumb, loaded, $closing];
    }

    class Loading extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$4, create_fragment$4, not_equal, { thumb: 0, loaded: 1 });
    	}
    }

    /* src/components/image.svelte generated by Svelte v3.47.0 */

    function create_if_block_1$1(ctx) {
    	let img;
    	let img_sizes_value;
    	let img_outro;
    	let current;

    	return {
    		c() {
    			img = element("img");
    			attr(img, "srcset", /*srcset*/ ctx[8]);
    			attr(img, "sizes", img_sizes_value = /*opts*/ ctx[7].sizes || `${/*sizes*/ ctx[1]}px`);
    			attr(img, "alt", /*alt*/ ctx[10]);
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (!current || dirty[0] & /*sizes*/ 2 && img_sizes_value !== (img_sizes_value = /*opts*/ ctx[7].sizes || `${/*sizes*/ ctx[1]}px`)) {
    				attr(img, "sizes", img_sizes_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			if (img_outro) img_outro.end(1);
    			current = true;
    		},
    		o(local) {
    			img_outro = create_out_transition(img, fade, {});
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    			if (detaching && img_outro) img_outro.end();
    		}
    	};
    }

    // (404:85) {#if showLoader}
    function create_if_block$1(ctx) {
    	let loading;
    	let current;

    	loading = new Loading({
    			props: {
    				thumb: /*thumb*/ ctx[9],
    				loaded: /*loaded*/ ctx[2]
    			}
    		});

    	return {
    		c() {
    			create_component(loading.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(loading, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const loading_changes = {};
    			if (dirty[0] & /*loaded*/ 4) loading_changes.loaded = /*loaded*/ ctx[2];
    			loading.$set(loading_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(loading.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(loading.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(loading, detaching);
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let div1;
    	let div0;
    	let if_block0_anchor;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*loaded*/ ctx[2] && create_if_block_1$1(ctx);
    	let if_block1 = /*showLoader*/ ctx[3] && create_if_block$1(ctx);

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			if (if_block0) if_block0.c();
    			if_block0_anchor = empty();
    			if (if_block1) if_block1.c();
    			attr(div0, "class", "bp-img");
    			set_style(div0, "background-image", "url(" + /*thumb*/ ctx[9] + ")");
    			set_style(div0, "width", /*$imageDimensions*/ ctx[0][0] + "px");
    			set_style(div0, "height", /*$imageDimensions*/ ctx[0][1] + "px");
    			set_style(div0, "--x", /*$zoomDragTranslate*/ ctx[6][0] + "px");
    			set_style(div0, "--y", /*$zoomDragTranslate*/ ctx[6][1] + "px");
    			attr(div1, "class", "bp-img-wrap");
    			toggle_class(div1, "bp-drag", /*pointerDown*/ ctx[4]);
    			toggle_class(div1, "bp-close", /*closingWhileZoomed*/ ctx[5]);
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			if (if_block0) if_block0.m(div0, null);
    			append(div0, if_block0_anchor);
    			if (if_block1) if_block1.m(div0, null);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					action_destroyer(/*onMount*/ ctx[17].call(null, div1)),
    					listen(div1, "wheel", /*onWheel*/ ctx[13]),
    					listen(div1, "pointerdown", /*onPointerDown*/ ctx[14]),
    					listen(div1, "pointermove", /*onPointerMove*/ ctx[15]),
    					listen(div1, "pointerup", /*onPointerUp*/ ctx[16]),
    					listen(div1, "pointercancel", /*onPointerUp*/ ctx[16])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (/*loaded*/ ctx[2]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*loaded*/ 4) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_1$1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div0, if_block0_anchor);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*showLoader*/ ctx[3]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*showLoader*/ 8) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block$1(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div0, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty[0] & /*$imageDimensions*/ 1) {
    				set_style(div0, "width", /*$imageDimensions*/ ctx[0][0] + "px");
    			}

    			if (!current || dirty[0] & /*$imageDimensions*/ 1) {
    				set_style(div0, "height", /*$imageDimensions*/ ctx[0][1] + "px");
    			}

    			if (!current || dirty[0] & /*$zoomDragTranslate*/ 64) {
    				set_style(div0, "--x", /*$zoomDragTranslate*/ ctx[6][0] + "px");
    			}

    			if (!current || dirty[0] & /*$zoomDragTranslate*/ 64) {
    				set_style(div0, "--y", /*$zoomDragTranslate*/ ctx[6][1] + "px");
    			}

    			if (dirty[0] & /*pointerDown*/ 16) {
    				toggle_class(div1, "bp-drag", /*pointerDown*/ ctx[4]);
    			}

    			if (dirty[0] & /*closingWhileZoomed*/ 32) {
    				toggle_class(div1, "bp-close", /*closingWhileZoomed*/ ctx[5]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $zoomDragTranslate;
    	let $zoomed;
    	let $closing;
    	let $imageDimensions;
    	component_subscribe($$self, zoomed, $$value => $$invalidate(23, $zoomed = $$value));
    	component_subscribe($$self, closing, $$value => $$invalidate(24, $closing = $$value));
    	let { stuff } = $$props;
    	let { containerWidth } = $$props;
    	let { containerHeight } = $$props;
    	let { smallScreen } = $$props;
    	let { activeItem, calculateDimensions, loadImage, preloadNext, opts, prev, next, close, toggleControls, setResizeFunc } = stuff;
    	let { inline } = opts;
    	let { img: srcset, thumb, alt, width, height } = activeItem;
    	let maxZoom = activeItem.maxZoom || opts.maxZoom || 10;
    	let naturalWidth = +width;
    	let naturalHeight = +height;
    	let calculatedDimensions = calculateDimensions(naturalWidth, naturalHeight);
    	let sizes = calculatedDimensions[0];

    	// tracks load state of image
    	let loaded, showLoader;

    	// cache events to handle pinch
    	let eventCache = [];

    	// store positions for drag inertia
    	let dragPositions = [];

    	// bool true if multiple touch events
    	let isPinch;

    	// track distance for pinch events
    	let prevDiff = 0;

    	let pointerDown, hasDragged;
    	let dragStartX, dragStartY;

    	// zoomDragTranslate values on start of drag
    	let dragStartTranslateX, dragStartTranslateY;

    	// double click timeout (mobile controls)
    	let doubleClickTimeout;

    	// if true, adds class to .bp-wrap to avoid image cropping
    	let closingWhileZoomed;

    	// options for tweens - no animation if prefers reduced motion
    	const tweenOptions = {
    		easing: cubicOut,
    		duration: prefersReducedMotion ? 0 : 400
    	};

    	// tween to control image size
    	const imageDimensions = tweened(calculatedDimensions, tweenOptions);

    	component_subscribe($$self, imageDimensions, value => $$invalidate(0, $imageDimensions = value));

    	// translate transform for pointerDown
    	const zoomDragTranslate = tweened([0, 0], tweenOptions);

    	component_subscribe($$self, zoomDragTranslate, value => $$invalidate(6, $zoomDragTranslate = value));

    	// calculate translate position with bounds
    	const boundTranslateValues = ([x, y], newDimensions = $imageDimensions) => {
    		// image drag translate bounds
    		const maxTranslateX = (newDimensions[0] - containerWidth) / 2;

    		const maxTranslateY = (newDimensions[1] - containerHeight) / 2;

    		// x max drag
    		if (maxTranslateX < 0) {
    			x = 0;
    		} else if (x > maxTranslateX) {
    			if (smallScreen) {
    				// bound to left side (allow slight over drag)
    				x = pointerDown
    				? maxTranslateX + (x - maxTranslateX) / 10
    				: maxTranslateX;

    				// previous item if dragged past threshold
    				if (x > maxTranslateX + 20) {
    					// pointerdown = undefined to stop pointermove from running again
    					$$invalidate(4, pointerDown = prev());
    				}
    			} else {
    				x = maxTranslateX;
    			}
    		} else if (x < -maxTranslateX) {
    			// bound to right side (allow slight over drag)
    			if (smallScreen) {
    				x = pointerDown
    				? -maxTranslateX - (-maxTranslateX - x) / 10
    				: -maxTranslateX;

    				// next item if dragged past threshold
    				if (x < -maxTranslateX - 20) {
    					// pointerdown = undefined to stop pointermove from running again
    					$$invalidate(4, pointerDown = next());
    				}
    			} else {
    				x = -maxTranslateX;
    			}
    		}

    		// y max drag
    		if (maxTranslateY < 0) {
    			y = 0;
    		} else if (y > maxTranslateY) {
    			y = maxTranslateY;
    		} else if (y < -maxTranslateY) {
    			y = -maxTranslateY;
    		}

    		return [x, y];
    	};

    	// updates zoom level in or out based on amt value
    	const changeZoom = (e, amt = maxZoom) => {
    		if ($closing) {
    			return;
    		}

    		const cd = calculateDimensions(naturalWidth, naturalHeight);
    		const maxWidth = cd[0] * maxZoom;
    		const [currentImageWidth, currentImageHeight] = $imageDimensions;
    		let newWidth = currentImageWidth + currentImageWidth * amt;
    		let newHeight = currentImageHeight + currentImageHeight * amt;

    		if (amt > 0) {
    			if (newWidth > maxWidth) {
    				// requesting size large than max zoom
    				newWidth = maxWidth;

    				newHeight = cd[1] * maxZoom;
    			}

    			if (newWidth > naturalWidth) {
    				// if requesting zoom larger than natural size
    				newWidth = naturalWidth;

    				newHeight = naturalHeight;
    			}
    		} else if (newWidth < cd[0]) {
    			// if requesting image smaller than starting size
    			imageDimensions.set(cd);

    			zoomDragTranslate.set([0, 0]);
    			return;
    		}

    		let { x, y, width, height } = e.target.getBoundingClientRect();

    		// distance clicked from center of image
    		const offsetX = e.clientX - x - width / 2;

    		const offsetY = e.clientY - y - height / 2;
    		x = -offsetX * (newWidth / width) + offsetX;
    		y = -offsetY * (newHeight / height) + offsetY;
    		const newDimensions = [newWidth, newHeight];

    		// set new dimensions and update sizes property
    		imageDimensions.set(newDimensions).then(() => {
    			$$invalidate(1, sizes = Math.round(Math.max(sizes, newWidth)));
    		});

    		// update translate value
    		zoomDragTranslate.set(boundTranslateValues([$zoomDragTranslate[0] + x, $zoomDragTranslate[1] + y], newDimensions));
    	};

    	const onWheel = e => {
    		// return if scrolling past inline gallery w/ wheel
    		if (inline && !$zoomed) {
    			return;
    		}

    		// preventDefault to stop scrolling on zoomed inline image
    		e.preventDefault();

    		// change zoom on wheel
    		const deltaY = e.deltaY / -300;

    		changeZoom(e, deltaY);
    	};

    	// on drag start, store initial position and image translate values
    	const onPointerDown = e => {
    		// don't run if right click
    		if (e.button !== 2) {
    			e.preventDefault();
    			$$invalidate(4, pointerDown = true);
    			eventCache.push(e);
    			const [x, y] = [e.clientX, e.clientY];
    			dragStartX = x;
    			dragStartY = y;
    			dragStartTranslateX = $zoomDragTranslate[0];
    			dragStartTranslateY = $zoomDragTranslate[1];
    		}
    	};

    	// on drag, update image translate val
    	const onPointerMove = e => {
    		if (eventCache.length > 1) {
    			isPinch = true;
    			$$invalidate(4, pointerDown = false);
    			return handlePinch(e);
    		}

    		if (!pointerDown) {
    			return;
    		}

    		let [x, y] = [e.clientX, e.clientY];

    		// store positions for inertia
    		dragPositions.push({ x, y });

    		// overall drag diff from start location
    		x = x - dragStartX;

    		y = y - dragStartY;

    		// handle unzoomed left / right / up swipes
    		if (!$zoomed) {
    			// previous if swipe left
    			if (x > 40) {
    				// pointerdown = undefined to stop pointermove from running again
    				$$invalidate(4, pointerDown = prev());
    			}

    			// next if swipe right
    			if (x < -40) {
    				// pointerdown = undefined to stop pointermove from running again
    				$$invalidate(4, pointerDown = next());
    			}

    			// close if swipe up (don't close if inline)
    			if (y < -90) {
    				!opts.noClose && close();
    			}
    		}

    		hasDragged = Math.hypot(x, y) > 10;

    		// image drag when zoomed
    		if ($zoomed && hasDragged && !$closing) {
    			zoomDragTranslate.set(boundTranslateValues([dragStartTranslateX + x, dragStartTranslateY + y]), { duration: 0 });
    		}
    	};

    	const handlePinch = e => {
    		// update event in cache
    		eventCache = eventCache.map(ev => ev.pointerId == e.pointerId ? e : ev);

    		// Calculate the distance between the two pointers
    		const [p1, p2] = eventCache;

    		const dx = p1.clientX - p2.clientX;
    		const dy = p1.clientY - p2.clientY;
    		const curDiff = Math.hypot(dx, dy);

    		if (!prevDiff) {
    			prevDiff = curDiff;
    		}

    		// scale image
    		changeZoom(e, (prevDiff - curDiff) * -0.02);

    		// Cache the distance for the next move event
    		prevDiff = curDiff;
    	};

    	// on mouse / touch end, set pointerDown to false
    	function onPointerUp(e) {
    		// remove event from event cache
    		eventCache = eventCache.filter(ev => ev.pointerId != e.pointerId);

    		if (isPinch) {
    			// set isPinch to false after second finger lifts
    			isPinch = eventCache.length ? true : false;

    			prevDiff = 0;
    			return;
    		}

    		// make sure pointer events don't carry over to next image
    		if (!pointerDown) {
    			return;
    		}

    		// close if overlay is clicked
    		if (e.target === this && !opts.noClose) {
    			return close();
    		}

    		$$invalidate(4, pointerDown = false);

    		if (!smallScreen) {
    			// if largescreen
    			// single tap zooms in / out
    			if ($zoomed) {
    				hasDragged || changeZoom(e, -5);
    			} else {
    				// zoom in if not zoomed and drag scrolling page
    				dragPositions.length < 2 && !$zoomed && changeZoom(e);
    			}
    		} else {
    			// if smallscreen
    			// toggle controls on click / zoom on double click
    			if (!hasDragged) {
    				if (doubleClickTimeout) {
    					clearTimeout(doubleClickTimeout);
    					changeZoom(e, $zoomed ? -5 : 5);
    					doubleClickTimeout = 0;
    				} else {
    					doubleClickTimeout = setTimeout(
    						() => {
    							toggleControls();
    							doubleClickTimeout = 0;
    						},
    						250
    					);
    				}
    			}
    		}

    		// add drag inertia / snap back to bounds
    		if (hasDragged) {
    			dragPositions = dragPositions.slice(-3);
    			let coords;
    			let xDiff = dragPositions[1].x - dragPositions[2].x;
    			let yDiff = dragPositions[1].y - dragPositions[2].y;

    			if (Math.hypot(xDiff, yDiff) > 5) {
    				xDiff = dragPositions[0].x - dragPositions[2].x;
    				yDiff = dragPositions[0].y - dragPositions[2].y;
    				coords = [$zoomDragTranslate[0] - xDiff * 5, $zoomDragTranslate[1] - yDiff * 5];
    			} else {
    				coords = $zoomDragTranslate;
    			}

    			zoomDragTranslate.set(boundTranslateValues(coords));
    		}

    		// reset pointer states
    		hasDragged = false;

    		// reset dragPositions
    		dragPositions = [];
    	}

    	const onMount = () => {
    		// handle window resize
    		setResizeFunc(() => {
    			$$invalidate(22, calculatedDimensions = calculateDimensions(naturalWidth, naturalHeight));

    			// adjust image size / zoom on resize, but not on mobile because
    			// some browsers (ios safari 15) constantly resize screen on drag
    			if (!smallScreen) {
    				imageDimensions.set(calculatedDimensions);
    				zoomDragTranslate.set([0, 0]);
    			}
    		});

    		// decode initial image before rendering
    		loadImage(activeItem).then(() => {
    			$$invalidate(2, loaded = true);
    			preloadNext();
    		});

    		// show loading indicator if needed
    		setTimeout(
    			() => {
    				$$invalidate(3, showLoader = !loaded);
    			},
    			250
    		);
    	};

    	$$self.$$set = $$props => {
    		if ('stuff' in $$props) $$invalidate(18, stuff = $$props.stuff);
    		if ('containerWidth' in $$props) $$invalidate(19, containerWidth = $$props.containerWidth);
    		if ('containerHeight' in $$props) $$invalidate(20, containerHeight = $$props.containerHeight);
    		if ('smallScreen' in $$props) $$invalidate(21, smallScreen = $$props.smallScreen);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*$imageDimensions, calculatedDimensions*/ 4194305) {
    			set_store_value(zoomed, $zoomed = $imageDimensions[0] > calculatedDimensions[0], $zoomed);
    		}

    		if ($$self.$$.dirty[0] & /*$closing, $zoomed*/ 25165824) {
    			// if zoomed while closing, zoom out image and add class
    			// to change contain value on .bp-wrap to avoid cropping
    			if ($closing && $zoomed && !opts.intro) {
    				$$invalidate(5, closingWhileZoomed = true);
    				zoomDragTranslate.set([0, 0]);
    			}
    		}
    	};

    	return [
    		$imageDimensions,
    		sizes,
    		loaded,
    		showLoader,
    		pointerDown,
    		closingWhileZoomed,
    		$zoomDragTranslate,
    		opts,
    		srcset,
    		thumb,
    		alt,
    		imageDimensions,
    		zoomDragTranslate,
    		onWheel,
    		onPointerDown,
    		onPointerMove,
    		onPointerUp,
    		onMount,
    		stuff,
    		containerWidth,
    		containerHeight,
    		smallScreen,
    		calculatedDimensions,
    		$zoomed,
    		$closing
    	];
    }

    class Image extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$3,
    			create_fragment$3,
    			not_equal,
    			{
    				stuff: 18,
    				containerWidth: 19,
    				containerHeight: 20,
    				smallScreen: 21
    			},
    			null,
    			[-1, -1]
    		);
    	}
    }

    /* src/components/iframe.svelte generated by Svelte v3.47.0 */

    function create_fragment$2(ctx) {
    	let div;
    	let iframe_1;
    	let iframe_1_src_value;
    	let loading;
    	let current;
    	let mounted;
    	let dispose;

    	loading = new Loading({
    			props: {
    				thumb: /*thumb*/ ctx[3],
    				loaded: /*loaded*/ ctx[0]
    			}
    		});

    	return {
    		c() {
    			div = element("div");
    			iframe_1 = element("iframe");
    			create_component(loading.$$.fragment);
    			attr(iframe_1, "allow", "autoplay; fullscreen");
    			if (!src_url_equal(iframe_1.src, iframe_1_src_value = /*iframe*/ ctx[2])) attr(iframe_1, "src", iframe_1_src_value);
    			attr(iframe_1, "title", /*title*/ ctx[4]);
    			attr(div, "class", "bp-if");
    			set_style(div, "width", /*dimensions*/ ctx[1][0] + "px");
    			set_style(div, "height", /*dimensions*/ ctx[1][1] + "px");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, iframe_1);
    			mount_component(loading, div, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen(iframe_1, "load", /*load_handler*/ ctx[6]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			const loading_changes = {};
    			if (dirty & /*loaded*/ 1) loading_changes.loaded = /*loaded*/ ctx[0];
    			loading.$set(loading_changes);

    			if (!current || dirty & /*dimensions*/ 2) {
    				set_style(div, "width", /*dimensions*/ ctx[1][0] + "px");
    			}

    			if (!current || dirty & /*dimensions*/ 2) {
    				set_style(div, "height", /*dimensions*/ ctx[1][1] + "px");
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(loading.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(loading.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(loading);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { stuff } = $$props;
    	let { activeItem, calculateDimensions, setResizeFunc } = stuff;
    	let { iframe, thumb, title, width, height } = activeItem;
    	let loaded;
    	let dimensions;
    	const setDimensions = () => $$invalidate(1, dimensions = calculateDimensions(width, height));
    	setDimensions();
    	setResizeFunc(setDimensions);
    	const load_handler = () => $$invalidate(0, loaded = true);

    	$$self.$$set = $$props => {
    		if ('stuff' in $$props) $$invalidate(5, stuff = $$props.stuff);
    	};

    	return [loaded, dimensions, iframe, thumb, title, stuff, load_handler];
    }

    class Iframe extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, not_equal, { stuff: 5 });
    	}
    }

    /* src/components/video.svelte generated by Svelte v3.47.0 */

    function create_fragment$1(ctx) {
    	let div;
    	let loading;
    	let current;
    	let mounted;
    	let dispose;

    	loading = new Loading({
    			props: {
    				thumb: /*thumb*/ ctx[2],
    				loaded: /*loaded*/ ctx[0]
    			}
    		});

    	return {
    		c() {
    			div = element("div");
    			create_component(loading.$$.fragment);
    			attr(div, "class", "bp-vid");
    			set_style(div, "width", /*dimensions*/ ctx[1][0] + "px");
    			set_style(div, "height", /*dimensions*/ ctx[1][1] + "px");
    			set_style(div, "background-image", "url(" + /*thumb*/ ctx[2] + ")");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			mount_component(loading, div, null);
    			current = true;

    			if (!mounted) {
    				dispose = action_destroyer(/*onMount*/ ctx[3].call(null, div));
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			const loading_changes = {};
    			if (dirty & /*loaded*/ 1) loading_changes.loaded = /*loaded*/ ctx[0];
    			loading.$set(loading_changes);

    			if (!current || dirty & /*dimensions*/ 2) {
    				set_style(div, "width", /*dimensions*/ ctx[1][0] + "px");
    			}

    			if (!current || dirty & /*dimensions*/ 2) {
    				set_style(div, "height", /*dimensions*/ ctx[1][1] + "px");
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(loading.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(loading.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(loading);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { stuff } = $$props;
    	let loaded, dimensions;
    	let { activeItem, calculateDimensions, setResizeFunc } = stuff;
    	let { sources, thumb, tracks = [], width, height } = activeItem;
    	const setDimensions = () => $$invalidate(1, dimensions = calculateDimensions(width, height));
    	setDimensions();
    	setResizeFunc(setDimensions);
    	const audio = JSON.stringify(sources).includes('audio');

    	// adds attributes to a node
    	const addAttributes = (node, obj) => {
    		Object.keys(obj).forEach(key => attr(node, key, obj[key]));
    	};

    	const onMount = node => {
    		// create audo / video element
    		const mediaElement = element(audio ? 'audio' : 'video');

    		// add attributes to created elements
    		addAttributes(mediaElement, {
    			controls: true,
    			autoplay: true,
    			playsinline: true,
    			tabindex: '0'
    		});

    		// takes supplied object and creates elements in video
    		const appendToVideo = (tag, arr) => {
    			if (!Array.isArray(arr)) {
    				arr = JSON.parse(arr);
    			}

    			// add attributes
    			arr.forEach(obj => {
    				const el = element(tag);
    				addAttributes(el, obj);
    				append(mediaElement, el);
    			});
    		};

    		appendToVideo('track', tracks);
    		appendToVideo('source', sources);
    		listen(mediaElement, 'canplay', () => $$invalidate(0, loaded = true));
    		node.prepend(mediaElement);
    	};

    	$$self.$$set = $$props => {
    		if ('stuff' in $$props) $$invalidate(4, stuff = $$props.stuff);
    	};

    	return [loaded, dimensions, thumb, onMount, stuff];
    }

    class Video extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, not_equal, { stuff: 4 });
    	}
    }

    /* src/bigger-picture.svelte generated by Svelte v3.47.0 */

    function create_if_block(ctx) {
    	let div1;
    	let div0;
    	let div0_transition;
    	let previous_key = /*activeItem*/ ctx[6].i;
    	let key_block_anchor;
    	let containerActions_action;
    	let current;
    	let mounted;
    	let dispose;
    	let key_block = create_key_block(ctx);
    	let if_block = (!/*smallScreen*/ ctx[10] || !/*hideControls*/ ctx[9]) && create_if_block_1(ctx);

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			key_block.c();
    			key_block_anchor = empty();
    			if (if_block) if_block.c();
    			attr(div1, "class", "bp-wrap");
    			toggle_class(div1, "zoomed", /*$zoomed*/ ctx[13]);
    			toggle_class(div1, "bp-inline", /*inline*/ ctx[11]);
    			toggle_class(div1, "bp-noclose", /*opts*/ ctx[5].noClose);
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			key_block.m(div1, null);
    			append(div1, key_block_anchor);
    			if (if_block) if_block.m(div1, null);
    			current = true;

    			if (!mounted) {
    				dispose = action_destroyer(containerActions_action = /*containerActions*/ ctx[21].call(null, div1));
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty[0] & /*activeItem*/ 64 && not_equal(previous_key, previous_key = /*activeItem*/ ctx[6].i)) {
    				group_outros();
    				transition_out(key_block, 1, 1, noop);
    				check_outros();
    				key_block = create_key_block(ctx);
    				key_block.c();
    				transition_in(key_block);
    				key_block.m(div1, key_block_anchor);
    			} else {
    				key_block.p(ctx, dirty);
    			}

    			if (!/*smallScreen*/ ctx[10] || !/*hideControls*/ ctx[9]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*smallScreen, hideControls*/ 1536) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div1, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (dirty[0] & /*$zoomed*/ 8192) {
    				toggle_class(div1, "zoomed", /*$zoomed*/ ctx[13]);
    			}

    			if (dirty[0] & /*inline*/ 2048) {
    				toggle_class(div1, "bp-inline", /*inline*/ ctx[11]);
    			}

    			if (dirty[0] & /*opts*/ 32) {
    				toggle_class(div1, "bp-noclose", /*opts*/ ctx[5].noClose);
    			}
    		},
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div0_transition) div0_transition = create_bidirectional_transition(div0, fade, { easing: cubicOut, duration: 480 }, true);
    				div0_transition.run(1);
    			});

    			transition_in(key_block);
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			if (!div0_transition) div0_transition = create_bidirectional_transition(div0, fade, { easing: cubicOut, duration: 480 }, false);
    			div0_transition.run(0);
    			transition_out(key_block);
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (detaching && div0_transition) div0_transition.end();
    			key_block.d(detaching);
    			if (if_block) if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (350:7) {:else}
    function create_else_block(ctx) {
    	let div;
    	let raw_value = /*activeItem*/ ctx[6].html + "";

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "bp-html");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			div.innerHTML = raw_value;
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*activeItem*/ 64 && raw_value !== (raw_value = /*activeItem*/ ctx[6].html + "")) div.innerHTML = raw_value;		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (344:35) 
    function create_if_block_6(ctx) {
    	let iframe;
    	let current;

    	iframe = new Iframe({
    			props: {
    				stuff: {
    					activeItem: /*activeItem*/ ctx[6],
    					calculateDimensions: /*calculateDimensions*/ ctx[15],
    					setResizeFunc: /*setResizeFunc*/ ctx[14]
    				}
    			}
    		});

    	return {
    		c() {
    			create_component(iframe.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(iframe, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const iframe_changes = {};

    			if (dirty[0] & /*activeItem*/ 64) iframe_changes.stuff = {
    				activeItem: /*activeItem*/ ctx[6],
    				calculateDimensions: /*calculateDimensions*/ ctx[15],
    				setResizeFunc: /*setResizeFunc*/ ctx[14]
    			};

    			iframe.$set(iframe_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(iframe.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(iframe.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(iframe, detaching);
    		}
    	};
    }

    // (338:36) 
    function create_if_block_5(ctx) {
    	let video;
    	let current;

    	video = new Video({
    			props: {
    				stuff: {
    					activeItem: /*activeItem*/ ctx[6],
    					calculateDimensions: /*calculateDimensions*/ ctx[15],
    					setResizeFunc: /*setResizeFunc*/ ctx[14]
    				}
    			}
    		});

    	return {
    		c() {
    			create_component(video.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(video, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const video_changes = {};

    			if (dirty[0] & /*activeItem*/ 64) video_changes.stuff = {
    				activeItem: /*activeItem*/ ctx[6],
    				calculateDimensions: /*calculateDimensions*/ ctx[15],
    				setResizeFunc: /*setResizeFunc*/ ctx[14]
    			};

    			video.$set(video_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(video.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(video.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(video, detaching);
    		}
    	};
    }

    // (322:4) {#if activeItem.img}
    function create_if_block_4(ctx) {
    	let imageitem;
    	let current;

    	imageitem = new Image({
    			props: {
    				stuff: {
    					activeItem: /*activeItem*/ ctx[6],
    					calculateDimensions: /*calculateDimensions*/ ctx[15],
    					loadImage: /*loadImage*/ ctx[17],
    					preloadNext: /*preloadNext*/ ctx[16],
    					opts: /*opts*/ ctx[5],
    					prev: /*prev*/ ctx[2],
    					next: /*next*/ ctx[3],
    					close: /*close*/ ctx[1],
    					toggleControls: /*toggleControls*/ ctx[20],
    					setResizeFunc: /*setResizeFunc*/ ctx[14]
    				},
    				containerWidth: /*containerWidth*/ ctx[7],
    				containerHeight: /*containerHeight*/ ctx[8],
    				smallScreen: /*smallScreen*/ ctx[10]
    			}
    		});

    	return {
    		c() {
    			create_component(imageitem.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(imageitem, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const imageitem_changes = {};

    			if (dirty[0] & /*activeItem, opts*/ 96) imageitem_changes.stuff = {
    				activeItem: /*activeItem*/ ctx[6],
    				calculateDimensions: /*calculateDimensions*/ ctx[15],
    				loadImage: /*loadImage*/ ctx[17],
    				preloadNext: /*preloadNext*/ ctx[16],
    				opts: /*opts*/ ctx[5],
    				prev: /*prev*/ ctx[2],
    				next: /*next*/ ctx[3],
    				close: /*close*/ ctx[1],
    				toggleControls: /*toggleControls*/ ctx[20],
    				setResizeFunc: /*setResizeFunc*/ ctx[14]
    			};

    			if (dirty[0] & /*containerWidth*/ 128) imageitem_changes.containerWidth = /*containerWidth*/ ctx[7];
    			if (dirty[0] & /*containerHeight*/ 256) imageitem_changes.containerHeight = /*containerHeight*/ ctx[8];
    			if (dirty[0] & /*smallScreen*/ 1024) imageitem_changes.smallScreen = /*smallScreen*/ ctx[10];
    			imageitem.$set(imageitem_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(imageitem.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(imageitem.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(imageitem, detaching);
    		}
    	};
    }

    // (350:75) {#if activeItem.caption}
    function create_if_block_3(ctx) {
    	let div;
    	let raw_value = /*activeItem*/ ctx[6].caption + "";
    	let div_transition;
    	let current;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "bp-cap");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			div.innerHTML = raw_value;
    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*activeItem*/ 64) && raw_value !== (raw_value = /*activeItem*/ ctx[6].caption + "")) div.innerHTML = raw_value;		},
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 200 }, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o(local) {
    			if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 200 }, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (detaching && div_transition) div_transition.end();
    		}
    	};
    }

    // (311:63) {#key activeItem.i}
    function create_key_block(ctx) {
    	let div;
    	let current_block_type_index;
    	let if_block0;
    	let div_intro;
    	let div_outro;
    	let if_block1_anchor;
    	let current;
    	let mounted;
    	let dispose;
    	const if_block_creators = [create_if_block_4, create_if_block_5, create_if_block_6, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*activeItem*/ ctx[6].img) return 0;
    		if (/*activeItem*/ ctx[6].sources) return 1;
    		if (/*activeItem*/ ctx[6].iframe) return 2;
    		return 3;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	let if_block1 = /*activeItem*/ ctx[6].caption && create_if_block_3(ctx);

    	return {
    		c() {
    			div = element("div");
    			if_block0.c();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    			attr(div, "class", "bp-inner");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if_blocks[current_block_type_index].m(div, null);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(div, "pointerdown", /*pointerdown_handler*/ ctx[28]),
    					listen(div, "pointerup", /*pointerup_handler*/ ctx[29])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block0 = if_blocks[current_block_type_index];

    				if (!if_block0) {
    					if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block0.c();
    				} else {
    					if_block0.p(ctx, dirty);
    				}

    				transition_in(if_block0, 1);
    				if_block0.m(div, null);
    			}

    			if (/*activeItem*/ ctx[6].caption) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*activeItem*/ 64) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_3(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);

    			add_render_callback(() => {
    				if (div_outro) div_outro.end(1);
    				div_intro = create_in_transition(div, /*animateIn*/ ctx[18], {});
    				div_intro.start();
    			});

    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			if (div_intro) div_intro.invalidate();
    			div_outro = create_out_transition(div, /*animateOut*/ ctx[19], {});
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if_blocks[current_block_type_index].d();
    			if (detaching && div_outro) div_outro.end();
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (350:198) {#if !smallScreen || !hideControls}
    function create_if_block_1(ctx) {
    	let div;
    	let button;
    	let div_transition;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = /*items*/ ctx[0].length > 1 && create_if_block_2(ctx);

    	return {
    		c() {
    			div = element("div");
    			button = element("button");
    			if (if_block) if_block.c();
    			attr(button, "class", "bp-x");
    			attr(button, "title", "Close");
    			attr(button, "aria-label", "Close");
    			attr(div, "class", "bp-controls");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, button);
    			if (if_block) if_block.m(div, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*close*/ ctx[1]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (/*items*/ ctx[0].length > 1) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_2(ctx);
    					if_block.c();
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 300 }, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o(local) {
    			if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 300 }, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			if (detaching && div_transition) div_transition.end();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (355:6) {#if items.length > 1}
    function create_if_block_2(ctx) {
    	let div;
    	let t_value = `${/*position*/ ctx[4] + 1} / ${/*items*/ ctx[0].length}` + "";
    	let t;
    	let button0;
    	let button1;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div = element("div");
    			t = text(t_value);
    			button0 = element("button");
    			button1 = element("button");
    			attr(div, "class", "bp-count");
    			attr(button0, "class", "bp-prev");
    			attr(button0, "title", "Previous");
    			attr(button0, "aria-label", "Previous");
    			attr(button1, "class", "bp-next");
    			attr(button1, "title", "Next");
    			attr(button1, "aria-label", "Next");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t);
    			insert(target, button0, anchor);
    			insert(target, button1, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*prev*/ ctx[2]),
    					listen(button1, "click", /*next*/ ctx[3])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*position, items*/ 17 && t_value !== (t_value = `${/*position*/ ctx[4] + 1} / ${/*items*/ ctx[0].length}` + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (detaching) detach(button0);
    			if (detaching) detach(button1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*items*/ ctx[0] && create_if_block(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*items*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*items*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let $closing;
    	let $zoomed;
    	component_subscribe($$self, closing, $$value => $$invalidate(33, $closing = $$value));
    	component_subscribe($$self, zoomed, $$value => $$invalidate(13, $zoomed = $$value));
    	let { items = undefined } = $$props;
    	let { target = undefined } = $$props;
    	const { documentElement: html } = document;

    	// index of current active item
    	let position;

    	// options passed via open method
    	let opts;

    	// bool tracks open state
    	let isOpen;

    	// dom element to restore focus to on close
    	let focusTrigger;

    	// container element
    	let container, containerWidth, containerHeight;

    	// bool controlling visual state of controls
    	let hideControls;

    	// bool true if containerWidth < 769
    	let smallScreen;

    	// bool value of inline option passed in open method
    	let inline;

    	// when position is set
    	let movement;

    	// stores target on pointerdown (ref for overlay close)
    	let clickedEl;

    	// active item object
    	let activeItem;

    	// true if activeItem is html
    	let activeItemIsHtml;

    	// function set by child component to run when container resized
    	let resizeFunc;

    	const setResizeFunc = fn => resizeFunc = fn;

    	const open = options => {
    		$$invalidate(5, opts = options);
    		$$invalidate(11, inline = opts.inline);
    		const openItems = opts.items;

    		// update trigger element to restore focus
    		// add class to hide scroll if not inline gallery
    		if (!inline && html.scrollHeight > html.clientHeight) {
    			html.classList.add('bp-lock');
    		}

    		focusTrigger = document.activeElement;
    		$$invalidate(7, containerWidth = target.offsetWidth);

    		$$invalidate(8, containerHeight = target === document.body
    		? window.innerHeight
    		: target.clientHeight);

    		$$invalidate(10, smallScreen = containerWidth < 769);
    		$$invalidate(4, position = opts.position || 0);

    		// reset controls
    		$$invalidate(9, hideControls = false);

    		// make array w/ dataset to work with
    		if (Array.isArray(openItems)) {
    			// array was passed
    			$$invalidate(0, items = openItems.map((item, i) => {
    				// override gallery position if needed
    				if (opts.el && opts.el === item.element) {
    					$$invalidate(4, position = i);
    				}

    				return { i, ...item };
    			}));
    		} else {
    			// nodelist / node was passed
    			$$invalidate(0, items = (openItems.length ? [...openItems] : [openItems]).map((element, i) => {
    				// override gallery position if needed
    				if (opts.el === element) {
    					$$invalidate(4, position = i);
    				}

    				return { element, i, ...element.dataset };
    			}));
    		}
    	};

    	const close = () => {
    		opts.onClose && opts.onClose();
    		set_store_value(closing, $closing = 1, $closing);
    		$$invalidate(0, items = false);

    		// restore focus to trigger element
    		focusTrigger && focusTrigger.focus({ preventScroll: true });
    	};

    	const prev = () => setPosition(position - 1);
    	const next = () => setPosition(position + 1);

    	const setPosition = index => {
    		movement = index - position;
    		$$invalidate(4, position = getNextPosition(index));
    	};

    	// get next gallery position
    	const getNextPosition = index => {
    		if (index >= items.length) {
    			index = 0;
    		} else if (index < 0) {
    			index = items.length - 1;
    		}

    		return index;
    	};

    	const onKeydown = e => {
    		const { key, shiftKey } = e;

    		if (key === 'Escape') {
    			!opts.noClose && close();
    		} else if (key === 'ArrowRight') {
    			next();
    		} else if (key === 'ArrowLeft') {
    			prev();
    		} else if (key === 'Tab') {
    			// trap focus on tab press
    			const { activeElement } = document;

    			// allow browser to handle tab into video controls only
    			if (shiftKey || !activeElement.controls) {
    				e.preventDefault();
    				const focusWrap = opts.focusWrap || container;
    				const tabbable = [...focusWrap.querySelectorAll('*')].filter(n => n.tabIndex >= 0);
    				let index = tabbable.indexOf(activeElement);
    				index += tabbable.length + (shiftKey ? -1 : 1);
    				index %= tabbable.length;
    				tabbable[index].focus();
    			}
    		}
    	};

    	// calculates dimensions within window for given height / width
    	const calculateDimensions = (fullWidth, fullHeight) => {
    		fullWidth = fullWidth || 1920;
    		fullHeight = fullHeight || 1080;
    		const scale = opts.scale || 0.99;
    		let width, height;
    		const windowAspect = containerHeight / containerWidth;
    		const mediaAspect = fullHeight / fullWidth;

    		if (mediaAspect > windowAspect) {
    			height = Math.min(fullHeight, containerHeight * scale);
    			width = height / mediaAspect;
    		} else {
    			width = Math.min(fullWidth, containerWidth * scale);
    			height = width * mediaAspect;
    		}

    		return [Math.round(width), Math.round(height)];
    	};

    	// preloads images for previous and next items in gallery
    	const preloadNext = () => {
    		const nextItem = items[getNextPosition(position + 1)];
    		const prevItem = items[getNextPosition(position - 1)];
    		nextItem && !nextItem.preload && loadImage(nextItem);
    		prevItem && !prevItem.preload && loadImage(prevItem);
    	};

    	// loads / decodes image for item
    	const loadImage = item => {
    		const { img, width, height } = item;

    		if (!img) {
    			return;
    		}

    		const image = element('img');
    		image.sizes = opts.sizes || `${calculateDimensions(width, height)[0]}px`;
    		image.srcset = img;
    		item.preload = image;
    		return image.decode();
    	};

    	// animate media in when bp is first opened
    	const animateIn = node => {
    		if (!isOpen) {
    			$$invalidate(25, isOpen = 1);
    			opts.onOpen && opts.onOpen(container, activeItem);

    			return opts.intro
    			? fly(node, { y: 10, easing: cubicOut })
    			: scaleIn(node);
    		}

    		return fly(node, {
    			x: movement > 0 ? 20 : -20,
    			easing: cubicOut,
    			duration: 250
    		});
    	};

    	// animate media out when bp is closed
    	const animateOut = node => {
    		if (!items) {
    			return opts.intro
    			? fly(node, { y: -10, easing: cubicOut })
    			: scaleIn(node);
    		}

    		return fly(node, {
    			x: movement > 0 ? -20 : 20,
    			easing: cubicOut,
    			duration: 250
    		});
    	};

    	// custom svelte transition for entrance zoom
    	const scaleIn = node => {
    		let bpItem = node.firstElementChild;

    		// images and html have a wrapper div, so we must go deeper
    		if (activeItem.img || activeItemIsHtml) {
    			bpItem = bpItem.firstElementChild;
    		}

    		const element = activeItem.element || focusTrigger;
    		const { clientWidth, clientHeight } = bpItem;
    		const { top, left, width, height } = element.getBoundingClientRect();
    		const leftOffset = left - (containerWidth - width) / 2;
    		const centerTop = top - (containerHeight - height) / 2;
    		const scaleWidth = element.clientWidth / clientWidth;
    		const scaleHeight = element.clientHeight / clientHeight;

    		return {
    			duration: 480,
    			easing: cubicOut,
    			css: t => {
    				const tDiff = 1 - t;
    				return `transform:translate3d(${leftOffset * tDiff}px, ${centerTop * tDiff}px, 0px) scale3d(${scaleWidth + t * (1 - scaleWidth)}, ${scaleHeight + t * (1 - scaleHeight)}, 1)`;
    			}
    		};
    	};

    	// toggle controls for small screen
    	const toggleControls = () => $$invalidate(9, hideControls = !hideControls);

    	const containerActions = node => {
    		$$invalidate(26, container = node);
    		let removeKeydownListener;
    		let roActive;

    		// don't use keyboard events for inline galleries
    		if (!inline) {
    			removeKeydownListener = listen(window, 'keydown', onKeydown);
    		}

    		// set up resize observer
    		const ro = new ResizeObserver(entries => {
    				// use roActive to avoid running on initial open
    				if (roActive) {
    					$$invalidate(7, containerWidth = entries[0].contentRect.width);
    					$$invalidate(8, containerHeight = entries[0].contentRect.height);
    					$$invalidate(10, smallScreen = containerWidth < 769);

    					// run child component resize function
    					resizeFunc && resizeFunc();

    					// run user defined onResize function
    					opts.onResize && opts.onResize(container, activeItem);
    				}

    				roActive = true;
    			});

    		ro.observe(node);

    		return {
    			destroy() {
    				ro.disconnect();
    				removeKeydownListener && removeKeydownListener();
    				set_store_value(closing, $closing = $$invalidate(25, isOpen = false), $closing);

    				// remove class hiding scroll
    				html.classList.remove('bp-lock');

    				opts.onClosed && opts.onClosed();
    			}
    		};
    	};

    	const pointerdown_handler = e => $$invalidate(12, clickedEl = e.target);

    	const pointerup_handler = function (e) {
    		// only close if left click on self and not dragged
    		if (e.button !== 2 && e.target === this && clickedEl === this) {
    			!opts.noClose && close();
    		}
    	};

    	$$self.$$set = $$props => {
    		if ('items' in $$props) $$invalidate(0, items = $$props.items);
    		if ('target' in $$props) $$invalidate(22, target = $$props.target);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*items, position, activeItem, isOpen, activeItemIsHtml, opts, container*/ 234881137) {
    			if (items) {
    				// update active item when position changes
    				$$invalidate(6, activeItem = items[position]);

    				$$invalidate(27, activeItemIsHtml = activeItem.hasOwnProperty('html'));

    				if (isOpen) {
    					// clear child resize function if html
    					activeItemIsHtml && setResizeFunc(null);

    					// run onUpdate when items updated
    					opts.onUpdate && opts.onUpdate(container, activeItem);
    				}
    			}
    		}
    	};

    	return [
    		items,
    		close,
    		prev,
    		next,
    		position,
    		opts,
    		activeItem,
    		containerWidth,
    		containerHeight,
    		hideControls,
    		smallScreen,
    		inline,
    		clickedEl,
    		$zoomed,
    		setResizeFunc,
    		calculateDimensions,
    		preloadNext,
    		loadImage,
    		animateIn,
    		animateOut,
    		toggleControls,
    		containerActions,
    		target,
    		open,
    		setPosition,
    		isOpen,
    		container,
    		activeItemIsHtml,
    		pointerdown_handler,
    		pointerup_handler
    	];
    }

    class Bigger_picture extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance,
    			create_fragment,
    			not_equal,
    			{
    				items: 0,
    				target: 22,
    				open: 23,
    				close: 1,
    				prev: 2,
    				next: 3,
    				setPosition: 24
    			},
    			null,
    			[-1, -1]
    		);
    	}

    	get items() {
    		return this.$$.ctx[0];
    	}



    	get target() {
    		return this.$$.ctx[22];
    	}



    	get open() {
    		return this.$$.ctx[23];
    	}

    	get close() {
    		return this.$$.ctx[1];
    	}

    	get prev() {
    		return this.$$.ctx[2];
    	}

    	get next() {
    		return this.$$.ctx[3];
    	}

    	get setPosition() {
    		return this.$$.ctx[24];
    	}
    }

    /**
     * Initializes BiggerPicture
     * @param {{target: string}} options
     * @returns BiggerPicture instance
     */
    function biggerPicture (options) {
    	return new Bigger_picture({
    		...options,
    		props: options,
    	})
    }

    return biggerPicture;

}));
