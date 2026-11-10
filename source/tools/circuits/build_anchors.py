#!/usr/bin/env python3
"""Build a circuit anchors.json from existing pits.json + marshals.json + track/meta.json.

Reusable for every lot-1+ circuit. Does not invent geometry: it only maps already
measured placements onto the contract names (CAHIER §5.2 + CONSIGNES_TY §6).
NPC clip names are copied from Spa (idle, jack_push, flag_wave_yellow, …) — no new clips.
"""
from __future__ import annotations
import argparse, json, math
from pathlib import Path


def load(p: Path):
    return json.loads(p.read_text()) if p and p.exists() else None


def add(out: dict, name: str, **kw):
    rec = {k: v for k, v in kw.items() if v is not None}
    rec['name'] = name
    out[name] = rec
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--circuit', required=True, help='id: bahrain, monza_2020, imola, spa…')
    ap.add_argument('--pits', type=Path, help='pits.json (Spa schema)')
    ap.add_argument('--marshals', type=Path, help='marshals.json')
    ap.add_argument('--meta', type=Path, help='track/meta.json (grid, pitlane, startFinish)')
    ap.add_argument('--pitlane', type=Path, help='track/pitlane.json if not in meta')
    ap.add_argument('-o', '--out', type=Path, required=True)
    args = ap.parse_args()

    pits = load(args.pits) or {}
    marshals = load(args.marshals) or {}
    meta = load(args.meta) or {}
    pitlane = load(args.pitlane) or pits.get('pitlane') or meta.get('pitlane') or {}

    anchors: dict = {
        'circuit': args.circuit,
        'season': pits.get('season', 2020),
        'conventions': pits.get('conventions') or {
            'frame': 'repère circuit glTF Y-haut, mètres',
            'yaw': 'rotation autour de +Y (rad), node +Z = regard / sortie',
            's': 'abscisse curviligne (m) de la ligne centrale du dossier track/',
        },
        'npc_clips_source': 'shared/assets/spa_pits/npc_*.glb (clips existants, pas de nouvelle animation)',
        'anchors': {},
    }
    A = anchors['anchors']

    # --- player garage (local space of garage_player, plus world via team frame) ---
    pg = pits.get('player_garage') or {}
    screens = pg.get('screens') or []
    for i, sc in enumerate(screens, 1):
        add(A, f'anchor_pitscreen_{i}',
            node=sc.get('node'), material=sc.get('material', 'screen_live'),
            local=sc.get('local'), yaw_local=sc.get('yaw_local'),
            size_m=sc.get('size_m'),
            note='plan écran matériau remplaçable (télémétrie live)')
    jacks = pg.get('jacks') or {}
    if isinstance(jacks, dict):
        # spa schema: {'front': {...}, 'rear': {...}} sometimes wrapped in a 1-element list
        pass
    if isinstance(jacks, list) and jacks and isinstance(jacks[0], dict) and 'front' in jacks[0]:
        jacks = jacks[0]
    if isinstance(jacks, dict):
        for side in ('front', 'rear'):
            j = jacks.get(side) or {}
            add(A, f'anchor_jack_{side}',
                node=j.get('node'), pivot=j.get('pivot'), local=j.get('local'))
    empties = pg.get('empties') or {}
    add(A, 'anchor_garage_stop', node=empties.get('pit_stop', 'pitbox_stop'))
    add(A, 'anchor_garage_park', node=empties.get('car1_park', 'car1_park'),
        node_car2=empties.get('car2_park'))
    pbl = pg.get('pitbox_light') or {}
    add(A, 'anchor_pit_box_light', red=pbl.get('red', 'pitbox_red'),
        green=pbl.get('green', 'pitbox_green'))
    add(A, 'pitbox_red', node=pbl.get('red', 'pitbox_red'))
    add(A, 'pitbox_green', node=pbl.get('green', 'pitbox_green'))

    # first engineer spot → contract anchor_engineer (others stay in pits.json npc_spots)
    spots = pg.get('npc_spots') or []
    eng = next((s for s in spots if s.get('kind') == 'engineer'), None)
    if eng:
        add(A, 'anchor_engineer', local=eng.get('pos'), yaw=eng.get('yaw'),
            clip=eng.get('clip', 'look_screen'),
            note='clip existant Spa, pas de nouvelle animation')

    # --- team garages / pit wall / pit box ---
    for g in pits.get('garages') or []:
        team = g.get('team')
        if not team:
            continue
        frame = g.get('frame') or {}
        add(A, f'anchor_pitbox_{team}',
            pos=(g.get('pit_stop') or {}).get('pos'),
            heading=(g.get('pit_stop') or {}).get('heading'),
            frame_pos=frame.get('pos'), yaw=frame.get('yaw'),
            lod_node=g.get('lod_node'))
        pw = g.get('pitwall') or {}
        add(A, f'anchor_pitwall_{team}',
            node=pw.get('node'), pos=pw.get('pos'), yaw=pw.get('yaw'),
            seats=pw.get('seats'))

    # --- pit exit lights ---
    pel = pits.get('pit_exit_lights') or {}
    if pel:
        add(A, 'anchor_pit_exit_light',
            pos=pel.get('pos'), yaw=pel.get('yaw'), s=pel.get('s'),
            nodes=pel.get('nodes'), node_pos=pel.get('node_pos'))

    # --- marshals / light panels / signals ---
    for post in marshals.get('posts') or []:
        n = post.get('id')
        add(A, f'anchor_marshal_post_{n}',
            s=post.get('s'), d=post.get('d'), side=post.get('side'),
            pos=post.get('panel_center') or post.get('center'),
            yaw=post.get('yaw'), group_node=post.get('group_node'),
            nodes=post.get('nodes'))
        add(A, f'anchor_light_panel_{n}',
            s=post.get('s'), d=post.get('d'),
            pos=post.get('panel_center'), yaw=post.get('yaw'),
            nodes=post.get('nodes'), group_node=post.get('group_node'))

    for sig in marshals.get('signals') or []:
        sid = sig.get('id') or sig.get('type')
        typ_l = str(sig.get('type') or '').lower()
        is_start = sid in ('startlights', 'start_lights') or (
            'feu de départ' in typ_l and '5' in typ_l and 'colonne' in typ_l
        )
        if is_start:
            add(A, 'anchor_start_lights',
                pos=sig.get('position'), s=sig.get('s'), d=sig.get('d'),
                housing_node=sig.get('housing_node'), lamps=sig.get('lamps'))
            lamps = sig.get('lamps') or []
            # startlight_1..5 = the 5 columns (r1 red of each column if named cN_r1)
            cols = {}
            for lamp in lamps:
                node = lamp.get('node') or ''
                # bahrain: startlight_c1_r1 …
                if '_c' in node and '_r' in node:
                    try:
                        col = int(node.split('_c')[1].split('_')[0])
                    except ValueError:
                        continue
                    if 'r1' in node:
                        cols[col] = lamp
            if not cols and lamps:
                # fallback: first 5 lamps
                for i, lamp in enumerate(lamps[:5], 1):
                    cols[i] = lamp
            for i in range(1, 6):
                lamp = cols.get(i)
                if lamp:
                    add(A, f'startlight_{i}', node=lamp.get('node'),
                        pos=lamp.get('center'), color=lamp.get('color'))
        is_pitexit = sid in ('pitexit', 'pit_exit') or typ_l.startswith('feu de sortie')
        if is_pitexit:
            if 'anchor_pit_exit_light' not in A:
                add(A, 'anchor_pit_exit_light',
                    pos=sig.get('position'), s=sig.get('s'), d=sig.get('d'),
                    housing_node=sig.get('housing_node'), lamps=sig.get('lamps'))

    # --- pit entry / exit from pitlane ---
    pl = pitlane if isinstance(pitlane, dict) else {}
    # points may be in pl['points_xyzs'] or a file
    add(A, 'anchor_pit_entry', s=pl.get('entry_s'), note=pl.get('note'))
    add(A, 'anchor_pit_exit', s=pl.get('exit_s'))

    # --- grid 1..20 ---
    grid = (meta.get('grid') or {})
    slots = grid.get('slots') if isinstance(grid, dict) else grid
    if isinstance(slots, list):
        for sl in slots:
            posn = sl.get('pos') or sl.get('id')
            if posn:
                add(A, f'anchor_grid_{int(posn)}', s=sl.get('s'), side=sl.get('side'),
                    pos=sl.get('pos_xyz') or sl.get('position'))

    # --- safety car lines (if present in meta) ---
    sc = meta.get('safetyCar') or meta.get('sc_lines') or {}
    if isinstance(sc, dict):
        for i, key in enumerate(('line1', 'line_1', 'sc_line_1', 1), 1):
            pass
        for i in (1, 2):
            rec = sc.get(f'line_{i}') or sc.get(f'line{i}') or sc.get(i)
            if rec:
                add(A, f'anchor_sc_line_{i}', **(rec if isinstance(rec, dict) else {'s': rec}))

    # crane: only if a measured position exists (do not invent)
    crane = (pits.get('crane') or meta.get('crane') or marshals.get('crane'))
    if crane:
        add(A, 'anchor_crane', **(crane if isinstance(crane, dict) else {'note': str(crane)}))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(anchors, indent=2, ensure_ascii=False) + '\n')
    print('wrote', args.out, 'n_anchors', len(A))
    missing = [n for n in (
        'anchor_garage_stop', 'anchor_garage_park', 'anchor_jack_front', 'anchor_jack_rear',
        'anchor_pitscreen_1', 'anchor_pitscreen_2', 'anchor_pitscreen_3', 'anchor_engineer',
        'anchor_pit_exit_light', 'anchor_start_lights', 'anchor_pit_entry', 'anchor_pit_exit',
        'anchor_grid_1', 'anchor_crane',
    ) if n not in A or (n in A and not any(k in A[n] for k in ('pos', 's', 'local', 'node') if A[n].get(k) not in (None,)))]
    # softer missing report
    soft = []
    for n in ('anchor_garage_stop', 'anchor_garage_park', 'anchor_jack_front', 'anchor_jack_rear',
              'anchor_pitscreen_1', 'anchor_pitscreen_2', 'anchor_pitscreen_3', 'anchor_engineer',
              'anchor_pit_exit_light', 'anchor_start_lights', 'anchor_grid_1', 'anchor_crane'):
        if n not in A:
            soft.append(n)
    if soft:
        print('not yet present (need measured source):', ', '.join(soft))


if __name__ == '__main__':
    main()
