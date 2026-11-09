# REASSEMBLE — assets/spa_pits

Les binaires poussés via MCP `add_commit` sont stockés en **base64 littéral**
(même format que `shared/incoming/cars/`). Il faut décoder.

Fichiers > ~3 Mo : découpés en `.part001`, `.part002`, … — décoder **chaque** part, puis concaténer.

## Fichiers découpés

| Fichier | Taille | Parts | SHA256 |
|---|---:|---:|---|
| `garage_player.glb` | 11140772 | 4 | `426dca21e567b2de58c692c3ec0d2282321b56b942f3834406f77871f1df0914` |

## Tous les fichiers (sha256 du binaire original)

| Path | Size | SHA256 | Split |
|---|---:|---|---|
| `README.md` | 1364 | `5c9f76f5c0325998962fb9a9fec879243f9c81a7a14f13882ef0e862f93948d1` | no |
| `RECHERCHE_GARAGE.md` | 7648 | `f6b3de3640e817eb9e1b382307aed53e0e58d389d49751a2de0bc4db915f0570` | no |
| `SOURCES.md` | 2795 | `20482ace84973f897d5d0056c8a570fb12dbf60a36fff6db878cdf57f10dad71` | no |
| `USAGE_ASSETS.md` | 6919 | `96e36919f6dc986d37b85d3c003eb05a939bec8c810dc39fbeb91b49fe57b0ec` | no |
| `brakeboards.glb` | 113184 | `d143c1521eaf301b0c07a9d6afd87da593c66e82f5d9fcf9a45e14c8f56261a2` | no |
| `garage_player.glb` | 11140772 | `426dca21e567b2de58c692c3ec0d2282321b56b942f3834406f77871f1df0914` | yes |
| `garages_lod.glb` | 693984 | `1b1d9f193dceaf5f7331dc0104f89210daa03ad6f8738cf41ad14f60bc903d92` | no |
| `marshal_lamps.glb` | 45528 | `344c4e6c53cd09eee506251c4f88865a2d6409d7f193fcc54ab12b6c50437e07` | no |
| `marshal_platforms.glb` | 34996 | `72ade39a9a533679d131475168a347102bc064d0552dbe07f17c39f70851ec13` | no |
| `marshals.json` | 18960 | `fc2c58c485d68ff50024ecd15c63bca2c5e1a1860eeeb5207c1b229a7d42bd34` | no |
| `npc_engineer.glb` | 1644968 | `f91ef3726ae91b48fc4fd6329fd47067944a6c5012803e42fbfab510d2daf754` | no |
| `npc_marshal.glb` | 1967892 | `5bac3e32eb255675d3bfbe441f0816d5ad6d3313040ce1223c5395e4d081ef50` | no |
| `npc_mechanic.glb` | 1506396 | `86a71d97391bde2c0d599eef45196255870caa536492422401e83aec616995d5` | no |
| `npc_tex/npc_engineer_alfaromeo_1024.ktx2` | 962370 | `ead573e3eb675c90da110d363b355879281110851b5619c1fdefdb81ded2f180` | no |
| `npc_tex/npc_engineer_alfaromeo_256.ktx2` | 79990 | `729c34e9b94674c1cb8ba6f0d6312d131e5980b5b407888a2ca3f816fca33aca` | no |
| `npc_tex/npc_engineer_alphatauri_1024.ktx2` | 980202 | `4e98859e8ef2d2b238f00b1a9499976654e5b6cba05f33b6db72ccde8baefdec` | no |
| `npc_tex/npc_engineer_alphatauri_256.ktx2` | 81295 | `45816f40764ab3daed61c8a0897ce4999d1fa4f2d4b1ac3cf87856bb7805766a` | no |
| `npc_tex/npc_engineer_ferrari_1024.ktx2` | 964061 | `13baadf6e1f3e3cbf8535607745034e4fae26e34d16608bfc4a1f9058d280209` | no |
| `npc_tex/npc_engineer_ferrari_256.ktx2` | 80066 | `f5a9cf7b8515c4c2fc31556d8b7cc7d039b011393559db1707e35937e734cb6a` | no |
| `npc_tex/npc_engineer_haas_1024.ktx2` | 953613 | `e2bcfd6962e8189d987386d721aa2ef50d7de64c6484dc863656a985beb333d8` | no |
| `npc_tex/npc_engineer_haas_256.ktx2` | 80129 | `6aa84627d589ece1e6c025ad6f62e1acf9e687fc138158d15cb384c32649c9cf` | no |
| `npc_tex/npc_engineer_mclaren_1024.ktx2` | 962717 | `bcba03fd2eaae64c055cee07af485e042a29d71648bf3fdcad2dd7224ead5db7` | no |
| `npc_tex/npc_engineer_mclaren_256.ktx2` | 81082 | `9b7ba37a6b0757dd91942900b5249dc7eb033e607717a06a097382b07aad0121` | no |
| `npc_tex/npc_engineer_mercedes_1024.ktx2` | 920941 | `43a00a987bd8659345102d3d10e52eed3ed34a6617e5b266d29ffe6b649dff86` | no |
| `npc_tex/npc_engineer_mercedes_256.ktx2` | 77394 | `32b138c7c6d83116415a3b59974c74b690ac3eafc6b6fff2708a2d0ad75efc01` | no |
| `npc_tex/npc_engineer_racingpoint_1024.ktx2` | 988914 | `cc9f2150d1f1a9eaa231b0c8e7e686282673e67fd51da1d74eb2952aff7b7ef0` | no |
| `npc_tex/npc_engineer_racingpoint_256.ktx2` | 82587 | `be9dea88bca13bdc5bc0e39bced99dca91487bf3a39b7a3d989ebd92d19314cb` | no |
| `npc_tex/npc_engineer_redbull_1024.ktx2` | 976930 | `7e45e1937c464849322ce5655738814f21fa01ceb2e5e5e28b06d645963f687b` | no |
| `npc_tex/npc_engineer_redbull_256.ktx2` | 81332 | `01e594b41ee756c23610071b1fd0942655cf9e5614b05c2b80348439745570b6` | no |
| `npc_tex/npc_engineer_renault_1024.ktx2` | 953123 | `dae84d60e24e8035aa225af804c57b45dad9af57aa81552e49da279cf3ff349b` | no |
| `npc_tex/npc_engineer_renault_256.ktx2` | 80265 | `5dc240cc268f0621d8bfa3045bd21d3bac80d56bc58198e6fc33cf4dcc1fc0d3` | no |
| `npc_tex/npc_engineer_williams_1024.ktx2` | 981407 | `946a0c466481535e846497fff3e8d4b7ab5dff8805b712c21fd82200365bd030` | no |
| `npc_tex/npc_engineer_williams_256.ktx2` | 81236 | `ce68f9312a424becec1b5e17a9d7704c6b824ff0afe9f04d65efb60349f46c2e` | no |
| `npc_tex/npc_mechanic_alfaromeo_1024.ktx2` | 831028 | `c58ab3adfb107f94ff211b3b2085583266896679e64409cceb7abdbe62db0a63` | no |
| `npc_tex/npc_mechanic_alfaromeo_256.ktx2` | 77751 | `d0b4006dc46dc8dd897faab634037fd751351d8a6ceca9dd83b45b0c23df8743` | no |
| `npc_tex/npc_mechanic_alphatauri_1024.ktx2` | 840130 | `39400713a80a40b46b634b373b83a59a1921d1a47db9c4b0eead348a1552b084` | no |
| `npc_tex/npc_mechanic_alphatauri_256.ktx2` | 78316 | `e6c41a8f22aefc8c5a7a6d4f95fa6f417139532b992a7a7d2934ce1ef1fa568c` | no |
| `npc_tex/npc_mechanic_ferrari_1024.ktx2` | 836613 | `fc0df317264553cd459bd597769dc6edf02b9444e1236951b8a899fbc98141e9` | no |
| `npc_tex/npc_mechanic_ferrari_256.ktx2` | 78254 | `4d9d7816ebe49d9b6f857b6016b3b4afb8dfdda7a1ac97dbcbf283a0a0d316cc` | no |
| `npc_tex/npc_mechanic_haas_1024.ktx2` | 816668 | `b39568039b71ade8cf4e42a4143830063f8909fd741f0f32e9f78e77dbd6f7a0` | no |
| `npc_tex/npc_mechanic_haas_256.ktx2` | 76752 | `a7af257c7de590f1d248ed0e880169c424ab6dbd044e034cc45b972b319c54cc` | no |
| `npc_tex/npc_mechanic_mclaren_1024.ktx2` | 848094 | `691b5fec3acd443d15d4f799db77e309f470112e3cf6290afe6f64d9145ddfdc` | no |
| `npc_tex/npc_mechanic_mclaren_256.ktx2` | 80693 | `fa428d71c13f7faac925b0c497eba908186f0057ab10f00baa48dff92b19aa6b` | no |
| `npc_tex/npc_mechanic_mercedes_1024.ktx2` | 808432 | `32636742e67ff90d76b5779a5d147ee6cc8846d18c36297b292bd65c03875513` | no |
| `npc_tex/npc_mechanic_mercedes_256.ktx2` | 75275 | `321421d1e8f0855defbebaa1db1ae1279196d28eaf58d447e512229aaf08190c` | no |
| `npc_tex/npc_mechanic_racingpoint_1024.ktx2` | 851665 | `d1cd3a6f8cea88984661b5aa47b6476c5cb43ae2fb696b969a4dae5d180868c9` | no |
| `npc_tex/npc_mechanic_racingpoint_256.ktx2` | 81331 | `13aa8a46e5a4bb9b67c2ccef4aa0b6195e2ab4fd125d50a29ccb4a33d47cbdf5` | no |
| `npc_tex/npc_mechanic_redbull_1024.ktx2` | 840776 | `67f05235e07ff64bc53406c2180afbb62e7d941c05a79fdfb4b47b5e0d29607b` | no |
| `npc_tex/npc_mechanic_redbull_256.ktx2` | 78114 | `6a6f85cda942dcca24a0b9f7b8098417b31c170a655ecf250ca18669d4240d47` | no |
| `npc_tex/npc_mechanic_renault_1024.ktx2` | 840401 | `73da66f38afe6e51a33796ccbd0b3c6b1a778a20e82032e092dbacb03a8d8484` | no |
| `npc_tex/npc_mechanic_renault_256.ktx2` | 80317 | `b10412ba4211093cb8b8688670812f20066b575cb8ae7e3a5d316d96f00cb8b3` | no |
| `npc_tex/npc_mechanic_williams_1024.ktx2` | 835229 | `68e51ac8066d587a744e401750a1e2f2e0d390ff9f2302b97ee2aa57b90cc170` | no |
| `npc_tex/npc_mechanic_williams_256.ktx2` | 77685 | `35f65e297e088347a5ce4bd71f2b8ee4a0f761f82010d1b7cc66031b6308eb04` | no |
| `pit_exit_lights.glb` | 58876 | `b02a68497963b807f857e1179429f4f4c3219df761df42d5e431f3eabf895455` | no |
| `pits.json` | 57398 | `e3714680ef4c47c3020c98cd9321d643fe213bb5a8cd0bc32c7e589f6eec3ef5` | no |
| `pitwall_stands.glb` | 1391692 | `a369b2a77ee01db5926611ae60d3f633d2409375ee212e3df8e24b70a63fddfb` | no |
| `preview/01_voie_des_stands_spa.jpg` | 138071 | `e77368045c0bc6ea6a8bb4ea466729d0488ee2df7eb9beb0f69939f70ee4c26d` | no |
| `preview/02_garage_contexte.jpg` | 132178 | `6a7845b6b49e5d2a3d32d3dfa812759e2ea06b8e60e775725d5692806a823c7f` | no |
| `preview/03_garage_pnj_pitbox.jpg` | 95710 | `9d3e80d1d225b6e739a71a69c41b548baf23a70f523c807442fa9ba359544b0f` | no |
| `preview/04_garage_interieur_pnj.jpg` | 139865 | `455de2731f4c5867f62d9f997a9539a30ade4f3c95d135522039bee29840a1f1` | no |
| `preview/05_commissaires_drapeaux.jpg` | 103623 | `b4a716a6ba71019aa8ab40d1c08a7811a697ffc29b70066f9493e358d2db5571` | no |
| `preview/06_commissaires_plateforme.jpg` | 143309 | `21d92b4b353c4635e873d4ca367b7bdc2b6bf7a882d0cfce642ed59bb532a33f` | no |
| `preview/07_panneau_lumineux_jaune.jpg` | 94298 | `461412f67d6e22ccd681a1f1521ef8f19aa7cca343937a9e4d4069e12874c093` | no |
| `preview/08_panneaux_distance.jpg` | 64872 | `c25915909aaaee9d81409cb70f46864a964104fd21d5b6a8c75ead9d8c09076a` | no |
| `preview/09_tenues_equipes.jpg` | 94056 | `efece48971b1b1bde461ea720b28c663cb7e7787ff0b05649006a7ef6017a699` | no |
| `preview/10_clips_ingenieur.jpg` | 90047 | `7f50281a284e6322858e34d18a5b6f2a573194cc5f96d57af66b96c9875e8042` | no |
| `preview/11_clips_drapeaux.jpg` | 78551 | `a4a37458fbb400a47f2f3ca878a94e0f15555edb728e08ed14c8dac17f4ad9e1` | no |
| `props/car_stands.glb` | 850684 | `4e563f510e37287cb6b5dc57f3e11207c3ca3b2b9990c7d85a13d32d65ad34c9` | no |
| `props/cooling_fan.glb` | 721872 | `b47b8576471d84ec87988626b6b55918e82b9bf91c6301245d9800655bcc7544` | no |
| `props/driver_cockpit_screen.glb` | 764976 | `3b8af3098269b8cb515725d53ea861aa5e112cb82931e41a538d156cf82c9ca9` | no |
| `props/empty_garage_shell_textured.glb` | 1074784 | `c4c9529b38f5fb228467aef8b6be42d8af979b4e4b02dd49cb36cebf68e1cdac` | no |
| `props/front_jack_mechanic.glb` | 823196 | `6b3f689b661fe894ec060fd08b42662eb7f9203ecec0baea9c5d54868151fdde` | no |
| `props/front_wing_stand.glb` | 804448 | `ab7590578a00cb41cae07e371def6b90a3f5ccc961383eec3fdd2d9d0d91d90d` | no |
| `props/grandstand_crowd.glb` | 1236220 | `89aca35f94cb2306d98f99146b3b736667ce826ee06e68e4d65bca151ff260ca` | no |
| `props/imac_style_pc.glb` | 520864 | `7b00f0067982edc575243228afd3076c3abf052d49172e7fc1ec20a81e07dc4f` | no |
| `props/macbook_pro_m3_16.glb` | 1273704 | `0ce2e49c24d9c5dc559c61d706a3c7ff9e6c9868c47d5a5abc491c9f686c7b25` | no |
| `props/nitrogen_bottle_cart.glb` | 1332944 | `b890aee886332e16b93791afcb9dfc4b3731397b93c3092e405b8599a9396b7f` | no |
| `props/overhead_lighting.glb` | 1528832 | `d39c89af68d39826e3dd4211ffcdb7ba098f8a9d52df0aee89e3f572c258c963` | no |
| `props/pit_board.glb` | 2490384 | `3f1a1dde31a6e50dfce78405e2eebbba5f4fcefdb0e9fb4acb5c7ddc62cbd574` | no |
| `props/pit_crew_gunner.glb` | 793948 | `0d8e005cad86d6d18974eaa271b36592f77a74c9997869132c28f385d381f440` | no |
| `props/pit_crew_mechanic.glb` | 796052 | `6f64c6c75be8c7e277c2834151eeca522b9901f5d4cdaea9a04de6fcfeed0f4d` | no |
| `props/pit_crew_tyre_off.glb` | 765412 | `81d6290e7eab9e2ccedc9f09ba8231ea2843ddc9f90a7f381852129431df382d` | no |
| `props/pit_crew_tyre_on.glb` | 816096 | `15620b478955d3a4a917aae947e508d2b48197140fdf6bfbd15d006fe1666c06` | no |
| `props/pit_gantry_overhead.glb` | 1025264 | `dbbfc2ccb8fc9db1b76f933b95cecb19502f977ed307edf5c16f0ef196ebfcf8` | no |
| `props/pit_stop_box_ground.glb` | 719092 | `976bac16357de4ac117566c033e0580231dca320233a05e2ddbe6b6e97528446` | no |
| `props/pit_wall_perch.glb` | 973672 | `019ffdb632358721fce4a41a62b3ecbab70015b72fefd07172dee2c3610fef73` | no |
| `props/quick_lift_jack.glb` | 804964 | `87532e44e40ff91e5fddc5e6263fdf25fe3f1dc12575076ed0e4f65c981f3df7` | no |
| `props/race_engineer.glb` | 827272 | `11fbbe5130744332f418e84bd488ee771f01051ca21e6008a87f3981b95a422b` | no |
| `props/rear_quick_lift_jack.glb` | 789892 | `42f49911f8c9e9808159f27c744af6ed4c6aa54443fca56cfbe6cf111ce1efaf` | no |
| `props/start_lights_gantry.glb` | 991196 | `e4f3ff35fd34a49d2946e4d0b1edca2f98977e11786d39c761ef965cdb64e6d4` | no |
| `props/telemetry_station.glb` | 1899024 | `09a65d5aa09fa1ddbeba226f2ff14fdd10525ba0deefd5c33ddddae1c4acd995` | no |
| `props/timing_leaderboard.glb` | 680020 | `d56d763d7f9be7562792d5969df04c8d7b3d80475a49675d450056c96f4d8bbe` | no |
| `props/tire_rack.glb` | 782404 | `6e7585201217d4ffc3f9ffc7081470a3652a3fe2ed09bf4b2b5292be2be9d08c` | no |
| `props/track_marshal.glb` | 876272 | `2b5fdc82c8d4802b0043489080c8e751d059a2fcb95cfa14bc570e186e0d61e2` | no |
| `props/wheel_gun.glb` | 675652 | `6951f6ccc9e583ce2581e13af621dbe109280c97fe81135a2a598caf3ad41fa5` | no |
| `props/workbench_cabinet.glb` | 1245908 | `5f227ca3813dcb09769d572a0a01ffe1e0ed00bbc82aa718237ddd98b9a5d3a6` | no |
| `textures/team_alfaromeo.ktx2` | 234556 | `bd08abb4631d2f280fc475c6a37279f782d3f3045d94ccd902b8d7793c1bfdae` | no |
| `textures/team_alphatauri.ktx2` | 237838 | `7dd97f42753a6a6612afc1ba45710171b209a01f3503f0263135e91ac5631388` | no |
| `textures/team_ferrari.ktx2` | 232004 | `fd9c6070a05de27cbfa1cbf0c2d1b6651ad169aceeec2141b7b04f5b68479661` | no |
| `textures/team_haas.ktx2` | 250787 | `0f51e7876a10e32c4b62280e00762f3c4dff6bcd1d9e6b86e70de1e23dbb157d` | no |
| `textures/team_mclaren.ktx2` | 264416 | `b72fe98f3e261099d176de2f018c937439368963744b7d86ba9070712326ff1c` | no |
| `textures/team_mercedes.ktx2` | 220854 | `4f4ee96882d253f3030cc90c5d9a19d619dca56d48f74f0553d0a0003e28dd90` | no |
| `textures/team_racingpoint.ktx2` | 261702 | `d6b054f4a087c9410fd4ff262d23d45425fde3e8ba6af3ec0bc7a117c380bf97` | no |
| `textures/team_redbull.ktx2` | 253930 | `365e881ccea161e00363ea2e64fbff5d0e3777dfe9b315657394f1a7e6a303bf` | no |
| `textures/team_renault.ktx2` | 272581 | `577a3665bc7e8f14f5f44f90f8d96380df4d57a2d535d6f95228ac7461bb31ba` | no |
| `textures/team_williams.ktx2` | 240359 | `93899d23f653a1b109d1e8bfe20311c22c1c973ff49d9c51cc51210f667ed0dd` | no |

## Linux / macOS

```bash
bash reassemble.sh
```

Pour un binaire **non découpé** stocké en base64 :

```bash
base64 -d fichier.glb.b64 > fichier.glb   # si tu as renommé
# ou, si le fichier GitLab EST le base64 :
base64 -d fichier.glb > fichier.decoded && mv fichier.decoded fichier.glb
```

## Windows (PowerShell)

```powershell
.\reassemble.ps1
```

